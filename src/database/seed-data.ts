import { RegistrationField } from 'src/registrations/registration.types';

export interface FieldSeed<TName extends string> {
    name: TName;
    label: string;
    step: number;
}

export const REGISTRATION_FIELD_SEEDS: FieldSeed<RegistrationField>[] = [
    { name: 'orgName', label: 'Название организации', step: 2 },
    { name: 'ogrn', label: 'ОГРН', step: 3 },
    { name: 'innKpp', label: 'ИНН/КПП', step: 4 },
    { name: 'urAdress', label: 'Юр. адрес, для ИП - прописка', step: 5 },
    { name: 'kktAdress', label: 'Адрес установки кассы(обязательно: индекс, регион, район, город)', step: 6 },
    { name: 'kktName', label: 'Наименование места установки (название торговой точки)', step: 7 },
    { name: 'phone', label: 'Телефон в федеральном формате', step: 8 },
    { name: 'phoneToCall', label: 'Телефон для связи', step: 9 },
    { name: 'email', label: 'E-mail', step: 10 },
    { name: 'nds', label: 'НДС (Да/Нет)', step: 11 },
    { name: 'excise', label: 'Подакцизные товары (Да/Нет)', step: 12 },
    { name: 'markirovka', label: 'Маркированые товары (Да/Нет)', step: 13 },
    { name: 'services', label: 'Услуги (Да/Нет)', step: 14 },
    { name: 'strictReporting', label: 'Услуги по бланкам строго отчетности (билеты, квитанции) (Да/Нет)', step: 15 },
    { name: 'taxSystem', label: 'Система налогообложения', step: 16 },
    { name: 'kktModel', label: 'Модель ККТ', step: 17 },
    { name: 'bankReqs', label: 'Банковские реквизиты (Наименование банка, БИК, Расч/счет, Кор/счет) - для ООО, для ИП можете написать "-"', step: 18 },
    { name: 'ofd', label: 'ОФД (При покупке у нас - Платформа ОФД)', step: 19 },
    { name: 'equipmentPhoto', label: 'Пришлите одно фото, где виден серийный номер кассы или ФН. Обычно он находится на шильдике кассы, коробке ФН или наклейке на комплекте', step: 20 },
];
