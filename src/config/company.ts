export const COMPANY_CONFIG = {
    id: 'besveca_llc',
    name: 'BESVECA, LLC',
    logoInitials: 'B',
    invoicePrefix: 'B', // Generates B-CLIENT-2405-01
    address: [
        'ADDR LINE 1 (Update in src/config/company.ts)',
        'CITY, STATE ZIP'
    ],
    contact: {
        email: 'billing@besveca.com', // Assumed, please update
        phone: '+1 (000) 000-0000'
    },
    bank: {
        name: 'BANK NAME (Update in src/config/company.ts)',
        address: 'BANK ADDRESS',
        routing: '000000000',
        account: '00000000',
        beneficiary: 'BESVECA, LLC'
    },
    theme: {
        color: 'slate' // You can change this to 'zinc', 'neutral', etc.
    }
};
