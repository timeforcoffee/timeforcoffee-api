import { Test, TestingModule } from '@nestjs/testing'
import { DbService } from './db.service'

// Mock sqlite3 module
jest.mock('sqlite3', () => {
    const mockDb = {
        all: jest.fn(),
    }
    return {
        Database: jest.fn(() => mockDb),
        OPEN_READONLY: 1,
        __mockDb: mockDb,
    }
})

describe('DbService', () => {
    let service: DbService
    let mockDb: any

    beforeEach(async () => {
        // Get the mock database instance
        const sqlite3 = require('sqlite3')
        mockDb = sqlite3.__mockDb

        const module: TestingModule = await Test.createTestingModule({
            providers: [DbService],
        }).compile()

        service = module.get<DbService>(DbService)
    })

    afterEach(() => {
        jest.clearAllMocks()
    })

    describe('zvvToSbbId', () => {
        it('should return original ID if not in ZVV range', async () => {
            const result = await service.zvvToSbbId('8591052')

            expect(result).toBe('8591052')
            expect(mockDb.all).not.toHaveBeenCalled()
        })

        it('should return original ID if below ZVV range', async () => {
            const result = await service.zvvToSbbId('290000')

            expect(result).toBe('290000')
        })

        it('should return original ID if above ZVV range', async () => {
            const result = await service.zvvToSbbId('300001')

            expect(result).toBe('300001')
        })

        it('should look up and convert ZVV ID in range 290001-299999', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [{ sbb_id: '8503000' }])
            })

            const result = await service.zvvToSbbId('295000')

            expect(result).toBe('8503000')
            expect(mockDb.all).toHaveBeenCalledWith(
                'select sbb_id from zvv_to_sbb where zvv_id = ?',
                ['295000'],
                expect.any(Function),
            )
        })

        it('should return null if ZVV ID not found in conversion table', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [])
            })

            const result = await service.zvvToSbbId('295001')

            expect(result).toBeNull()
        })

        it('should reject on database error', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'), null)
            })

            await expect(service.zvvToSbbId('295000')).rejects.toThrow('Database error')
        })
    })

    describe('getApiKey', () => {
        it('should return zvv apikey for Zürich station', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8591052',
                        county: 'Zürich',
                        name: 'Limmatplatz',
                        apikey: null,
                        apiid: null,
                        altsbbid: null,
                        go: 'VBZ',
                        limit: 40,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8591052')

            expect(result.apikey).toBe('zvv')
            expect(result.name).toBe('Limmatplatz')
            expect(result.id).toBe('8591052')
            expect(result.limit).toBe(40)
        })

        it('should return search apikey for non-Zürich station', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8507000',
                        county: 'Bern',
                        name: 'Bern',
                        apikey: null,
                        apiid: null,
                        altsbbid: null,
                        go: null,
                        limit: 50,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8507000')

            expect(result.apikey).toBe('search')
        })

        it('should use explicit apikey when set in DB', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8500000',
                        county: 'Basel',
                        name: 'Basel SBB',
                        apikey: 'otdOnly',
                        apiid: '8500000',
                        altsbbid: null,
                        go: null,
                        limit: 100,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8500000')

            expect(result.apikey).toBe('otdOnly')
            expect(result.apiid).toBe('8500000')
        })

        it('should follow altsbbid redirect', async () => {
            let callCount = 0
            mockDb.all.mockImplementation((query, params, callback) => {
                callCount++
                if (callCount === 1) {
                    // First call returns altsbbid redirect
                    callback(null, [
                        {
                            id: '8591000',
                            county: 'Zürich',
                            name: 'Old Station',
                            apikey: null,
                            apiid: null,
                            altsbbid: '8591001',
                            go: null,
                            limit: null,
                            ingtfsstops: 1,
                        },
                    ])
                } else {
                    // Second call returns actual station
                    callback(null, [
                        {
                            id: '8591001',
                            county: 'Zürich',
                            name: 'New Station',
                            apikey: 'zvv',
                            apiid: '8591001',
                            altsbbid: null,
                            go: 'VBZ',
                            limit: 30,
                            ingtfsstops: 1,
                        },
                    ])
                }
            })

            const result = await service.getApiKey('8591000')

            expect(result.name).toBe('New Station')
            expect(result.apikey).toBe('zvv')
        })

        it('should return default values for unknown station', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [])
            })

            const result = await service.getApiKey('9999999')

            expect(result.apikey).toBe('zvv')
            expect(result.apiid).toBe('9999999')
            expect(result.name).toBe('9999999')
            expect(result.limit).toBe(20)
            expect(result.ingtfsstops).toBe(1)
        })

        it('should use ZVV_ONLY operators for zvv apikey', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8591052',
                        county: 'Aargau', // Non-Zürich county
                        name: 'Some Station',
                        apikey: null,
                        apiid: null,
                        altsbbid: null,
                        go: 'SBB', // ZVV_ONLY operator
                        limit: 40,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8591052')

            expect(result.apikey).toBe('zvv')
        })

        it('should use ZVV_ONLY operators - VBZ', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8591052',
                        county: 'Aargau',
                        name: 'Some Station',
                        apikey: null,
                        apiid: null,
                        altsbbid: null,
                        go: 'VBZ',
                        limit: 40,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8591052')

            expect(result.apikey).toBe('zvv')
        })

        it('should use ZVV_ONLY operators - VZO', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8591052',
                        county: 'Aargau',
                        name: 'Some Station',
                        apikey: null,
                        apiid: null,
                        altsbbid: null,
                        go: 'VZO',
                        limit: 40,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8591052')

            expect(result.apikey).toBe('zvv')
        })

        it('should set apiid to id when apikey set but apiid missing', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8500000',
                        county: 'Basel',
                        name: 'Basel SBB',
                        apikey: 'otdOnly',
                        apiid: null, // Missing
                        altsbbid: null,
                        go: null,
                        limit: 100,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8500000')

            expect(result.apiid).toBe('8500000')
        })

        it('should reject on database error', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(new Error('Database error'), null)
            })

            await expect(service.getApiKey('8591052')).rejects.toThrow('Database error')
        })

        it('should handle Zurich spelling variation', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                callback(null, [
                    {
                        id: '8591052',
                        county: 'Zurich', // Without umlaut
                        name: 'Test Station',
                        apikey: null,
                        apiid: null,
                        altsbbid: null,
                        go: null,
                        limit: 40,
                        ingtfsstops: 1,
                    },
                ])
            })

            const result = await service.getApiKey('8591052')

            expect(result.apikey).toBe('zvv')
        })

        it('should handle station ID as integer', async () => {
            mockDb.all.mockImplementation((query, params, callback) => {
                expect(params[0]).toBe(8591052) // Should be parsed as integer
                callback(null, [])
            })

            await service.getApiKey('8591052')

            expect(mockDb.all).toHaveBeenCalled()
        })
    })
})
