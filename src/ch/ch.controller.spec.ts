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
    let dbService: jest.Mocked<DbService>

    const createMockDeparture = (
        scheduled: string,
        realtime: string | null,
        name: string,
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
    })

    beforeEach(async () => {
        const mockZvvController = {
            stationboard: jest.fn(),
            stationboardStarttime: jest.fn(),
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
                { provide: SearchController, useValue: {} },
                { provide: OpentransportdataController, useValue: {} },
                { provide: DbService, useValue: mockDbService },
                { provide: HelpersService, useValue: mockHelpersService },
                { provide: SlackService, useValue: mockSlackService },
            ],
        }).compile()

        controller = module.get<ChController>(ChController)
        zvvController = module.get(ZvvController)
        dbService = module.get(DbService)
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
})
