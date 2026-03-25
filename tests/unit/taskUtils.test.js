const { addBusinessDays } = require('../../src/utils/taskUtils');

describe('Task Utilities: addBusinessDays', () => {
    test('should add days correctly during the week (Monday to Wednesday)', () => {
        const monday = new Date('2026-03-23'); // Monday
        const wednesday = addBusinessDays(monday, 2);
        expect(wednesday.getDay()).toBe(3); // Wednesday
        expect(wednesday.getDate()).toBe(25);
    });

    test('should skip weekend when adding days from a Thursday', () => {
        const thursday = new Date('2026-03-19'); // Thursday
        // Add 2 business days: Friday(1), Monday(2)
        const monday = addBusinessDays(thursday, 2);
        expect(monday.getDay()).toBe(1); // Monday
        expect(monday.getDate()).toBe(23);
    });

    test('should skip weekend when adding days from a Friday', () => {
        const friday = new Date('2026-03-20'); // Friday
        // Add 2 business days: Monday(1), Tuesday(2)
        const tuesday = addBusinessDays(friday, 2);
        expect(tuesday.getDay()).toBe(2); // Tuesday
        expect(tuesday.getDate()).toBe(24);
    });

    test('should handle adding more than 5 days (crossing multiple weekends)', () => {
        const friday = new Date('2026-03-20'); // Friday
        // Add 6 business days: Mon(1), Tue(2), Wed(3), Thu(4), Fri(5), Mon(6)
        const nextMonday = addBusinessDays(friday, 6);
        expect(nextMonday.getDay()).toBe(1); 
        expect(nextMonday.getDate()).toBe(30);
    });
});
