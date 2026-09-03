import {build} from 'vite';
import {execFileSync} from 'node:child_process';
import {readFile, readdir, mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
const baseline='af143a00f65b298b7170e2bda4f33afcd0083c34';
const root=process.cwd();
const temporaryRoot=await mkdtemp(path.join(tmpdir(),'vitma-fe1b-bundle-'));
const paths=execFileSync('git',['ls-tree','-r','--name-only',baseline,'--','admin-ui','client-ui'],{encoding:'utf8'}).trim().split(/\r?\n/);
const originals=new Map(paths.map(file=>[path.resolve(file).replaceAll('\\','/'),file]));
const plugin={name:'exact-baseline-source',enforce:'pre',
    resolveId(source,importer) {
        if (!importer || !source.startsWith('.')) return null;
        const resolved=path.resolve(path.dirname(importer),source).replaceAll('\\','/');
        return [resolved,...['.tsx','.ts','.css','/index.tsx','/index.ts'].map(ext=>resolved+ext)].find(candidate=>originals.has(candidate)) ?? null;
    },
    load(id) { const file=originals.get(id.replaceAll('\\','/')); return file ? execFileSync('git',['show',`${baseline}:${file}`],{encoding:'utf8'}) : null; },
};
const report=[];
for (const app of ['admin-ui','client-ui']) {
    const output=path.resolve(temporaryRoot,app);
    if (!output.startsWith(temporaryRoot+path.sep)) throw new Error('Unsafe build output');
    await build({configFile:path.resolve(app,'vite.config.ts'),plugins:[plugin],build:{outDir:output,emptyOutDir:true}});
    for (const name of (await readdir(output)).filter(file=>/\.(js|css)$/.test(file))) {
        const before=await readFile(path.join(output,name)); const after=await readFile(path.join(root,app,'dist',name));
        report.push({app,name,baselineBytes:before.length,currentBytes:after.length,baselineGzip:gzipSync(before).length,currentGzip:gzipSync(after).length,identical:before.equals(after)});
    }
}
console.log(JSON.stringify({baseline,nodeEnv:process.env.NODE_ENV ?? 'unset',report},null,2));
