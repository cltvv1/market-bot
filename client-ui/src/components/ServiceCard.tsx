import {
    ArrowUpRight,
    CloudCog,
    CircleHelp,
    FileCheck2,
    MapPin,
    MessagesSquare,
    MonitorCog,
    ReceiptText,
    RefreshCw,
    Settings2,
    Workflow,
    Wrench,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ServiceDirection } from '../types';

const icons = {
    ReceiptText,
    Settings2,
    FileCheck2,
    RefreshCw,
    CloudCog,
    Workflow,
    Wrench,
    MonitorCog,
    MapPin,
    MessagesSquare,
    CircleHelp,
};

export function ServiceCard({ service }: { service: ServiceDirection }) {
    const Icon = icons[service.icon as keyof typeof icons] || Wrench;
    return (
        <article className="service-card">
            <div className="service-card__icon">
                <Icon aria-hidden="true" />
            </div>
            <div>
                <h3>{service.title}</h3>
                <p>{service.description}</p>
                <span>{service.timing}</span>
            </div>
            <Link
                to={`/service/request?type=${service.id}`}
                aria-label={`Оставить заявку: ${service.title}`}
            >
                <ArrowUpRight />
            </Link>
        </article>
    );
}
