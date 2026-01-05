import { Test, TestingModule } from '@nestjs/testing'
import { ChController } from './ch.controller'
import { ZvvController } from '../zvv/zvv.controller'
import { OstController } from '../ost/ost.controller'
import { BltController } from '../blt/blt.controller'
import { OpendataController } from '../opendata/opendata.controller'
import { SearchController } from '../search/search.controller'
import { OpentransportdataController } from '../opentransportdata/opentransportdata.controller'
import { DbService } from '../db/db.service'
import { HelpersService } from '../helpers/helpers.service'
import { SlackService } from '../slack/slack.service'
import { DeparturesType, DepartureType } from './ch.type'

describe('ChController', () => {
    let controller: ChController
    let zvvController: jest.Mocked<ZvvController>
    let searchController: jest.Mocked<SearchController>
    let otdController: jest.Mocked<OpentransportdataController>
    let dbService: jest.Mocked<DbService>
    let helpersService: jest.Mocked<HelpersService>
    let slackService: jest.Mocked<SlackService>

    const createMockDeparture = (
        scheduled: string,
        realtime: string | null,
        name: string,
        options: Partial<DepartureType> = {},
    ): DepartureType => ({
        dt: realtime || scheduled,
        accessible: false,
        arrival: { scheduled: '2026-01-05T09:00:00', realtime: null },
        name,
        departure: { scheduled, realtime },
        source: 'zvv',
        id: '8591052',
        to: 'Test Destination',
        colors: { fg: '#000000', bg: '#ffffff' },
        platform: null,
        type: 'tram',
        ...options,
    })

    beforeEach(async () => {
        const mockZvvController = {
            stationboard: jest.fn(),
            stationboardStarttime: jest.fn(),
        }

        const mockSearchController = {
            stationboard: jest.fn(),
        }

        const mockOtdController = {
            stationboard: jest.fn(),
        }

        const mockDbService = {
            getApiKey: jest.fn(),
            zvvToSbbId: jest.fn(),
        }

        const mockHelpersService = {
            callApi: jest.fn(),
            stationLimit: jest.fn(),
            setStationLimit: jest.fn(),
        }

        const mockSlackService = {
            sendAlert: jest.fn(),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ChController],
            providers: [
                { provide: ZvvController, useValue: mockZvvController },
                { provide: OstController, useValue: {} },
                { provide: BltController, useValue: {} },
                { provide: OpendataController, useValue: {} },
                { provide: SearchController, useValue: mockSearchController },
                { provide: OpentransportdataController, useValue: mockOtdController },
                { provide: DbService, useValue: mockDbService },
                { provide: HelpersService, useValue: mockHelpersService },
                { provide: SlackService, useValue: mockSlackService },
            ],
        }).compile()

        controller = module.get<ChController>(ChController)
        zvvController = module.get(ZvvController)
        searchController = module.get(SearchController)
        otdController = module.get(OpentransportdataController)
        dbService = module.get(DbService)
        helpersService = module.get(HelpersService)
        slackService = module.get(SlackService)
    })

    describe('getData', () => {
        describe('departure sorting by realtime', () => {
            it('should sort departures by dt field (realtime when available)', async () => {
                dbService.getApiKey.mockResolvedValue({
                    id: '8591052',
                    apiid: '8591052',
                    name: 'Limmatplatz',
                    apikey: 'zvv',
                    ingtfsstops: 1,
                    limit: 40,
                })

                const mockDepartures: DeparturesType = {
                    meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                    departures: [
                        // Scheduled order: 08:08, 08:07, 08:10
                        // But realtime order should be: 08:07, 08:08, 08:09
                        createMockDeparture('2026-01-05T08:08:00', '2026-01-05T08:08:00', '32'),
                        createMockDeparture('2026-01-05T08:07:00', '2026-01-05T08:07:00', '51'),
                        createMockDeparture('2026-01-05T08:10:00', '2026-01-05T08:09:00', '50'),
                    ],
                }

                zvvController.stationboard.mockResolvedValue(mockDepartures)

                const result = await controller.getData('8591052')

                expect('error' in result).toBe(false)
                if (!('error' in result)) {
                    expect(result.departures[0].name).toBe('51') // 08:07
                    expect(result.departures[1].name).toBe('32') // 08:08
                    expect(result.departures[2].name).toBe('50') // 08:09 realtime (scheduled 08:10)
                }
            })

            it('should handle mixed realtime and scheduled departures', async () => {
                dbService.getApiKey.mockResolvedValue({
                    id: '8591052',
                    apiid: '8591052',
                    name: 'Limmatplatz',
                    apikey: 'zvv',
                    ingtfsstops: 1,
                    limit: 40,
                })

                const mockDepartures: DeparturesType = {
                    meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                    departures: [
                        // Line 32: scheduled 08:08, no realtime -> dt = 08:08
                        createMockDeparture('2026-01-05T08:08:00', null, '32'),
                        // Line 51: scheduled 08:10, realtime 08:07 (early) -> dt = 08:07
                        createMockDeparture('2026-01-05T08:10:00', '2026-01-05T08:07:00', '51'),
                    ],
                }

                zvvController.stationboard.mockResolvedValue(mockDepartures)

                const result = await controller.getData('8591052')

                expect('error' in result).toBe(false)
                if (!('error' in result)) {
                    // Line 51 should come first because realtime 08:07 < scheduled 08:08
                    expect(result.departures[0].name).toBe('51')
                    expect(result.departures[1].name).toBe('32')
                }
            })

            it('should correctly order delayed departures (widget bug scenario)', async () => {
                // This tests the exact scenario from the widget bug:
                // Line 32 shows 2' but Line 51 shows 1' - yet 32 appeared first
                dbService.getApiKey.mockResolvedValue({
                    id: '8591052',
                    apiid: '8591052',
                    name: 'Limmatplatz',
                    apikey: 'zvv',
                    ingtfsstops: 1,
                    limit: 40,
                })

                const now = new Date('2026-01-05T08:06:00')
                const mockDepartures: DeparturesType = {
                    meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                    departures: [
                        // Line 32: scheduled first, realtime in 2 min
                        createMockDeparture('2026-01-05T08:07:00', '2026-01-05T08:08:00', '32'),
                        // Line 51: scheduled second, but realtime in 1 min
                        createMockDeparture('2026-01-05T08:08:00', '2026-01-05T08:07:00', '51'),
                    ],
                }

                zvvController.stationboard.mockResolvedValue(mockDepartures)

                const result = await controller.getData('8591052')

                expect('error' in result).toBe(false)
                if (!('error' in result)) {
                    // Line 51 (1') should come before Line 32 (2')
                    expect(result.departures[0].name).toBe('51')
                    expect(result.departures[0].dt).toBe('2026-01-05T08:07:00')
                    expect(result.departures[1].name).toBe('32')
                    expect(result.departures[1].dt).toBe('2026-01-05T08:08:00')
                }
            })

            it('should maintain order for departures with same realtime', async () => {
                dbService.getApiKey.mockResolvedValue({
                    id: '8591052',
                    apiid: '8591052',
                    name: 'Limmatplatz',
                    apikey: 'zvv',
                    ingtfsstops: 1,
                    limit: 40,
                })

                const mockDepartures: DeparturesType = {
                    meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                    departures: [
                        createMockDeparture('2026-01-05T08:08:00', '2026-01-05T08:10:00', '32'),
                        createMockDeparture('2026-01-05T08:09:00', '2026-01-05T08:10:00', '51'),
                        createMockDeparture('2026-01-05T08:07:00', '2026-01-05T08:07:00', '50'),
                    ],
                }

                zvvController.stationboard.mockResolvedValue(mockDepartures)

                const result = await controller.getData('8591052')

                expect('error' in result).toBe(false)
                if (!('error' in result)) {
                    expect(result.departures[0].name).toBe('50') // 08:07
                    // Lines 32 and 51 both have dt 08:10, order is stable
                    expect(result.departures[1].dt).toBe('2026-01-05T08:10:00')
                    expect(result.departures[2].dt).toBe('2026-01-05T08:10:00')
                }
            })
        })
    })

    describe('stationboardStarttime', () => {
        it('should sort departures by dt field', async () => {
            const mockDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T10:08:00', '2026-01-05T10:10:00', '32'),
                    createMockDeparture('2026-01-05T10:09:00', '2026-01-05T10:07:00', '51'),
                ],
            }

            zvvController.stationboardStarttime.mockResolvedValue(mockDepartures)

            const result = await controller.stationboardStarttime(
                '8591052',
                '2026-01-05T10:00',
            )

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                // Line 51 (realtime 10:07) should come before Line 32 (realtime 10:10)
                expect(result.departures[0].name).toBe('51')
                expect(result.departures[1].name).toBe('32')
            }
        })

        it('should handle error responses without sorting', async () => {
            zvvController.stationboardStarttime.mockResolvedValue({
                error: 'Station not found',
                code: 'NOTFOUND',
            })

            // Use different parameters to avoid cache hit from previous test
            const result = await controller.stationboardStarttime(
                '9999999',
                '2026-01-05T11:00',
            )

            expect('error' in result).toBe(true)
        })
    })

    describe('fallback behavior', () => {
        it('should fall back to search.ch when ZVV fails', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8591052',
                apiid: '8591052',
                name: 'Limmatplatz',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            })

            zvvController.stationboard.mockResolvedValue({
                error: 'ZVV API error',
                source: 'zvv',
            })

            const searchDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [createMockDeparture('2026-01-05T08:00:00', null, '32', { source: 'search' })],
            }
            searchController.stationboard.mockResolvedValue(searchDepartures)

            const result = await controller.getData('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].source).toBe('search')
            }
        })

        it('should fall back to OTD when both ZVV and search.ch fail', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8591052',
                apiid: '8591052',
                name: 'Limmatplatz',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            })

            zvvController.stationboard.mockResolvedValue({
                error: 'ZVV API error',
                source: 'zvv',
            })

            searchController.stationboard.mockResolvedValue({
                error: 'Search API error',
                source: 'search',
            })

            const otdDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [createMockDeparture('2026-01-05T08:00:00', null, '32', { source: 'otd' })],
            }
            otdController.stationboard.mockResolvedValue(otdDepartures)

            const result = await controller.getData('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].source).toBe('otd')
            }
        })

        it('should send Slack alert when ZVV fails', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8591052',
                apiid: '8591052',
                name: 'Limmatplatz',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            })

            zvvController.stationboard.mockResolvedValue({
                error: 'Connection timeout',
                source: 'zvv',
            })

            searchController.stationboard.mockResolvedValue({
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [],
            })

            await controller.getData('8591052')

            expect(slackService.sendAlert).toHaveBeenCalledWith(
                expect.objectContaining({
                    text: expect.stringContaining('zvv failed'),
                }),
                'zvvFail',
            )
        })

        it('should not send Slack alert for EAI_AGAIN errors', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8591052',
                apiid: '8591052',
                name: 'Limmatplatz',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            })

            zvvController.stationboard.mockResolvedValue({
                error: 'getaddrinfo EAI_AGAIN',
                source: 'zvv',
            })

            searchController.stationboard.mockResolvedValue({
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [],
            })

            await controller.getData('8591052')

            expect(slackService.sendAlert).not.toHaveBeenCalledWith(
                expect.anything(),
                'zvvFail',
            )
        })
    })

    describe('checkForError', () => {
        it('should return empty departures for NOTFOUND error', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8591052',
                apiid: '8591052',
                name: 'Limmatplatz',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            })

            zvvController.stationboard.mockResolvedValue({
                error: 'Station not found',
                code: 'NOTFOUND',
            })

            searchController.stationboard.mockResolvedValue({
                error: 'Station not found',
                code: 'NOTFOUND',
            })

            otdController.stationboard.mockResolvedValue({
                error: 'Station not found',
                code: 'NOTFOUND',
            })

            const result = await controller.getData('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures).toEqual([])
                expect(result.meta.station_name).toContain('not found')
            }
        })

        it('should not send Slack alert for known non-existing IDs', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8591055', // In NOTEXISTING_IDS list
                apiid: '8591055',
                name: 'Test Station',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            })

            zvvController.stationboard.mockResolvedValue({
                error: 'Station not found',
                code: 'NOTFOUND',
            })

            searchController.stationboard.mockResolvedValue({
                error: 'Station not found',
                code: 'NOTFOUND',
            })

            otdController.stationboard.mockResolvedValue({
                error: 'Station not found',
                code: 'NOTFOUND',
            })

            await controller.getData('8591055')

            expect(slackService.sendAlert).not.toHaveBeenCalledWith(
                expect.anything(),
                'notFound',
            )
        })
    })

    describe('combine', () => {
        it('should merge ZVV and search.ch data', async () => {
            const zvvDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', null, '32', {
                        accessible: false,
                        platform: null,
                    }),
                ],
            }

            const searchDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', null, '32', {
                        accessible: true,
                        platform: '1',
                        source: 'search',
                    }),
                ],
            }

            zvvController.stationboard.mockResolvedValue(zvvDepartures)

            const result = await controller.combine(
                '8591052',
                Promise.resolve(searchDepartures),
                'search',
                'Limmatplatz',
                40,
            )

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].accessible).toBe(true)
                expect(result.departures[0].platform).toBe('1')
                expect(result.departures[0].source).toContain('accessible: search')
            }
        })

        it('should use search.ch realtime when available', async () => {
            const zvvDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', null, '32'),
                ],
            }

            const searchDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', '2026-01-05T08:02:00', '32', {
                        source: 'search',
                    }),
                ],
            }

            zvvController.stationboard.mockResolvedValue(zvvDepartures)

            const result = await controller.combine(
                '8591052',
                Promise.resolve(searchDepartures),
                'search',
                'Limmatplatz',
                40,
            )

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].departure.realtime).toBe('2026-01-05T08:02:00')
            }
        })

        it('should use search.ch colors when ZVV has default colors', async () => {
            const zvvDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', null, '32', {
                        colors: { fg: '#000000', bg: '#ffffff' },
                    }),
                ],
            }

            const searchDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', null, '32', {
                        colors: { fg: '#ffffff', bg: '#0000ff' },
                        source: 'search',
                    }),
                ],
            }

            zvvController.stationboard.mockResolvedValue(zvvDepartures)

            const result = await controller.combine(
                '8591052',
                Promise.resolve(searchDepartures),
                'search',
                'Limmatplatz',
                40,
            )

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].colors.bg).toBe('#0000ff')
            }
        })

        it('should fall back to search.ch when ZVV fails in combine', async () => {
            zvvController.stationboard.mockResolvedValue({
                error: 'ZVV error',
                source: 'zvv',
            })

            const searchDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [createMockDeparture('2026-01-05T08:00:00', null, '32')],
            }

            const result = await controller.combine(
                '8591052',
                Promise.resolve(searchDepartures),
                'search',
                'Limmatplatz',
                40,
            )

            expect('error' in result).toBe(false)
        })

        it('should fall back to ZVV when search.ch fails in combine', async () => {
            const zvvDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [createMockDeparture('2026-01-05T08:00:00', null, '32')],
            }

            zvvController.stationboard.mockResolvedValue(zvvDepartures)

            const result = await controller.combine(
                '8591052',
                Promise.reject(new Error('Search error')),
                'search',
                'Limmatplatz',
                40,
            )

            expect('error' in result).toBe(false)
        })

        it('should mark unmatched departures as nomatch', async () => {
            const zvvDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', null, '32'),
                    createMockDeparture('2026-01-05T08:05:00', null, '51'),
                ],
            }

            const searchDepartures: DeparturesType = {
                meta: { station_id: '8591052', station_name: 'Limmatplatz' },
                departures: [
                    createMockDeparture('2026-01-05T08:00:00', null, '32', { source: 'search' }),
                    // 51 is missing - should be marked as nomatch
                ],
            }

            zvvController.stationboard.mockResolvedValue(zvvDepartures)

            const result = await controller.combine(
                '8591052',
                Promise.resolve(searchDepartures),
                'search',
                'Limmatplatz',
                40,
            )

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[1].source).toContain('nomatch')
            }
        })
    })

    describe('apikey routing', () => {
        it('should use otdOnly backend when apikey is otdOnly', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8507000',
                apiid: '8507000',
                name: 'Bern',
                apikey: 'otdOnly',
                ingtfsstops: 1,
                limit: 50,
            })

            const otdDepartures: DeparturesType = {
                meta: { station_id: '8507000', station_name: 'Bern' },
                departures: [createMockDeparture('2026-01-05T08:00:00', null, 'IC', { source: 'otd' })],
            }
            otdController.stationboard.mockResolvedValue(otdDepartures)

            const result = await controller.getData('8507000')

            expect(otdController.stationboard).toHaveBeenCalled()
            expect(zvvController.stationboard).not.toHaveBeenCalled()
        })

        it('should use combine for search apikey', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8507000',
                apiid: '8507000',
                name: 'Bern',
                apikey: 'search',
                ingtfsstops: 1,
                limit: 50,
            })

            const zvvDepartures: DeparturesType = {
                meta: { station_id: '8507000', station_name: 'Bern' },
                departures: [],
            }
            zvvController.stationboard.mockResolvedValue(zvvDepartures)

            const searchDepartures: DeparturesType = {
                meta: { station_id: '8507000', station_name: 'Bern' },
                departures: [createMockDeparture('2026-01-05T08:00:00', null, 'IC')],
            }
            searchController.stationboard.mockResolvedValue(searchDepartures)

            await controller.getData('8507000')

            expect(zvvController.stationboard).toHaveBeenCalled()
            expect(searchController.stationboard).toHaveBeenCalled()
        })

        it('should return empty departures for stations not in gtfs', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: '8591052',
                apiid: '8591052',
                name: 'Old Station',
                apikey: 'zvv',
                ingtfsstops: null, // Not in GTFS
                limit: 40,
            })

            const result = await controller.getData('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures).toEqual([])
                expect(result.meta.station_name).toContain('does not exist anymore')
            }
        })

        it('should return empty departures for NaN station ID', async () => {
            dbService.getApiKey.mockResolvedValue({
                id: 'NaN',
                apiid: 'NaN',
                name: 'Invalid',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            })

            const result = await controller.getData('NaN')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures).toEqual([])
            }
        })
    })
})
