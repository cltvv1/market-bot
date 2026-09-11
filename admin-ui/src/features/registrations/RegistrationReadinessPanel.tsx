import { RegistrationRequirementCard } from './RegistrationRequirementCard';
import { RegistrationActionButton } from './RegistrationActions';
import {
    ofdLabels,
    type RegistrationDetailData,
    type ActionSelection,
} from './types';

export function RegistrationReadinessPanel({
    data,
    revision,
    onAction,
}: {
    data: RegistrationDetailData;
    revision: number;
    onAction: (selection: ActionSelection) => void;
}) {
    return (
        <section className="reg-readiness">
            <div className="reg-context">
                <div>
                    <h2>Комплектность</h2>
                    <p>
                        ОФД:{' '}
                        <strong>
                            {ofdLabels[data.registration.ofdProvisionMode]}
                        </strong>
                    </p>
                    {data.registration.ofdProvisionMode ===
                        'purchase_from_vitma' && (
                        <p>
                            Код предоставляет ВИТМА. До получения и проверки
                            кода данные остаются неполными.
                        </p>
                    )}
                </div>
                <div className="admin-actions">
                    {['ofd-mode', 'equipment-kit'].map((name) => (
                        <RegistrationActionButton
                            key={name}
                            action={data.workflow.actions.find(
                                (action) => action.id === name,
                            )}
                            onAction={onAction}
                        />
                    ))}
                </div>
            </div>
            {data.registration.equipmentKitId && (
                <p className="admin-muted">
                    Привязан комплект #{data.registration.equipmentKitId}
                </p>
            )}
            {!data.checklistAvailable && (
                <div className="reg-warning" role="alert">
                    Перечень требований не инициализирован. Передача и
                    подготовка финального PDF недоступны. Обратитесь к
                    администратору.
                </div>
            )}
            <div className="reg-requirements">
                {data.requirements.map((item) => (
                    <RegistrationRequirementCard
                        key={item.id}
                        registrationId={data.registration.id}
                        item={item}
                        evidence={data.evidence.filter(
                            (file) => file.requirementId === item.id,
                        )}
                        revision={revision}
                        onAction={onAction}
                    />
                ))}
            </div>
        </section>
    );
}
