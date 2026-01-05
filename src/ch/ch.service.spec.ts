import { stripId, OUTPUT_DATE_FORMAT } from './ch.service'

describe('ch.service utilities', () => {
    describe('stripId', () => {
        it('should strip leading zeros from station ID', () => {
            expect(stripId('008591052')).toBe('8591052')
        })

        it('should strip multiple leading zeros', () => {
            expect(stripId('0000008591052')).toBe('8591052')
        })

        it('should not modify ID without leading zeros', () => {
            expect(stripId('8591052')).toBe('8591052')
        })

        it('should handle single digit', () => {
            expect(stripId('1')).toBe('1')
        })

        it('should handle ID with only zeros', () => {
            expect(stripId('0000')).toBe('')
        })

        it('should handle empty string', () => {
            expect(stripId('')).toBe('')
        })

        it('should not strip zeros in the middle or end', () => {
            expect(stripId('10500')).toBe('10500')
        })

        it('should strip leading zeros from short IDs', () => {
            expect(stripId('065')).toBe('65')
        })

        it('should handle ID starting with single zero', () => {
            expect(stripId('089')).toBe('89')
        })

        it('should preserve zero if it is the entire ID', () => {
            expect(stripId('0')).toBe('')
        })
    })

    describe('OUTPUT_DATE_FORMAT', () => {
        it('should be ISO 8601 format with milliseconds and timezone', () => {
            expect(OUTPUT_DATE_FORMAT).toBe('YYYY-MM-DDTHH:mm:ss.SSSZ')
        })

        it('should contain date components', () => {
            expect(OUTPUT_DATE_FORMAT).toContain('YYYY')
            expect(OUTPUT_DATE_FORMAT).toContain('MM')
            expect(OUTPUT_DATE_FORMAT).toContain('DD')
        })

        it('should contain time components', () => {
            expect(OUTPUT_DATE_FORMAT).toContain('HH')
            expect(OUTPUT_DATE_FORMAT).toContain('mm')
            expect(OUTPUT_DATE_FORMAT).toContain('ss')
        })

        it('should contain milliseconds', () => {
            expect(OUTPUT_DATE_FORMAT).toContain('SSS')
        })

        it('should contain timezone indicator', () => {
            expect(OUTPUT_DATE_FORMAT).toContain('Z')
        })

        it('should use T separator between date and time', () => {
            expect(OUTPUT_DATE_FORMAT).toContain('T')
        })
    })
})
