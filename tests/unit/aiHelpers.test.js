const aiHelpers = require('../../src/utils/aiHelpers');

describe('AI Helpers: extractAndParseJSON', () => {
    test('should extract and parse perfect JSON', () => {
        const text = '{"title": "Test", "status": "todo"}';
        const result = aiHelpers.extractAndParseJSON(text);
        expect(result.title).toBe('Test');
    });

    test('should extract and parse JSON from markdown code blocks', () => {
        const text = 'Here is the result:\n```json\n{"title": "Markdown Test", "status": "done"}\n```';
        const result = aiHelpers.extractAndParseJSON(text);
        expect(result.title).toBe('Markdown Test');
        expect(result.status).toBe('done');
    });

    test('should extract JSON from surrounded conversational text', () => {
        const text = 'Sure, I can help. Total: {"value": 100} Good Luck!';
        const result = aiHelpers.extractAndParseJSON(text);
        expect(result.value).toBe(100);
    });

    test('should handle and repair trailing commas', () => {
        // [1, 2, ] -> [1, 2]
        const text = '{"list": [1, 2, ], "extra": "field",}';
        const result = aiHelpers.extractAndParseJSON(text);
        expect(result.list).toEqual([1, 2]);
        expect(result.extra).toBe('field');
    });

    test('should extract arrays from markdown', () => {
        const text = 'Results: ```json [{"intent": "TEST"}] ```';
        const result = aiHelpers.extractAndParseJSON(text);
        expect(Array.isArray(result)).toBe(true);
        expect(result[0].intent).toBe('TEST');
    });

    test('should return null for malformed text without JSON indicators', () => {
        const text = 'Just some random words';
        const result = aiHelpers.extractAndParseJSON(text);
        expect(result).toBeNull();
    });
});
