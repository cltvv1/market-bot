import { Injectable } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';

export interface StoredFileReferenceColumn {
    constraintName: string;
    schemaName: string;
    tableName: string;
    columnName: string;
}

@Injectable()
export class StoredFileReferenceInspector {
    constructor(private readonly dataSource: DataSource) {}

    discover(manager: EntityManager = this.dataSource.manager) {
        return manager.query<StoredFileReferenceColumn[]>(
            `SELECT con.conname AS "constraintName",
                    child_ns.nspname AS "schemaName",
                    child.relname AS "tableName",
                    child_att.attname AS "columnName"
             FROM pg_constraint con
             JOIN pg_class child ON child.oid = con.conrelid
             JOIN pg_namespace child_ns ON child_ns.oid = child.relnamespace
             JOIN pg_class parent ON parent.oid = con.confrelid
             JOIN LATERAL unnest(con.conkey) WITH ORDINALITY child_key(attnum, ordinality) ON true
             JOIN LATERAL unnest(con.confkey) WITH ORDINALITY parent_key(attnum, ordinality)
               ON parent_key.ordinality = child_key.ordinality
             JOIN pg_attribute child_att
               ON child_att.attrelid = child.oid
              AND child_att.attnum = child_key.attnum
             JOIN pg_attribute parent_att
               ON parent_att.attrelid = parent.oid
              AND parent_att.attnum = parent_key.attnum
             WHERE con.contype = 'f'
               AND parent.relname = 'stored_files'
               AND parent_att.attname = 'id'
             ORDER BY child_ns.nspname, child.relname, child_att.attname`,
        );
    }

    async findReferencedIds(
        fileIds: number[],
        manager: EntityManager = this.dataSource.manager,
    ) {
        const referenced = new Set<number>();
        if (!fileIds.length) return referenced;
        for (const reference of await this.discover(manager)) {
            const rows = await manager.query<Array<{ id: number }>>(
                `SELECT DISTINCT ${quoteIdentifier(reference.columnName)} AS id
                 FROM ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
                 WHERE ${quoteIdentifier(reference.columnName)} = ANY($1::integer[])`,
                [fileIds],
            );
            for (const row of rows) referenced.add(Number(row.id));
        }
        return referenced;
    }

    async findReferences(
        fileId: number,
        manager: EntityManager = this.dataSource.manager,
    ) {
        const matches: StoredFileReferenceColumn[] = [];
        for (const reference of await this.discover(manager)) {
            const rows = await manager.query<Array<{ referenced: boolean }>>(
                `SELECT EXISTS (
                    SELECT 1
                    FROM ${quoteIdentifier(reference.schemaName)}.${quoteIdentifier(reference.tableName)}
                    WHERE ${quoteIdentifier(reference.columnName)} = $1
                 ) AS referenced`,
                [fileId],
            );
            if (rows[0]?.referenced) matches.push(reference);
        }
        return matches;
    }
}

function quoteIdentifier(value: string) {
    return `"${value.replaceAll('"', '""')}"`;
}
