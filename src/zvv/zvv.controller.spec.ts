import { Test, TestingModule } from '@nestjs/testing'
import { ZvvController } from './zvv.controller'
import { DbService } from '../db/db.service'
import { HelpersService } from '../helpers/helpers.service'

// Mock the cache decorator to pass through
jest.mock('../helpers/helpers.cache', () => ({
    Cache: () => (target: any, propertyKey: string, descriptor: PropertyDescriptor) => {
        // Return descriptor unchanged - no caching
        return descriptor
    },
    redisClient: {
        connected: false,
    },
}))

describe('ZvvController', () => {
    let controller: ZvvController
    let helpersService: jest.Mocked<HelpersService>
    let dbService: jest.Mocked<DbService>

    beforeEach(async () => {
        const mockHelpersService = {
            callApi: jest.fn(),
            stationLimit: jest.fn().mockResolvedValue('20'),
            setStationLimit: jest.fn(),
        }

        const mockDbService = {
            getApiKey: jest.fn().mockResolvedValue({
                id: '8591052',
                apiid: '8591052',
                name: 'Limmatplatz',
                apikey: 'zvv',
                ingtfsstops: 1,
                limit: 40,
            }),
            zvvToSbbId: jest.fn().mockImplementation(id => Promise.resolve(id)),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [ZvvController],
            providers: [
                { provide: DbService, useValue: mockDbService },
                { provide: HelpersService, useValue: mockHelpersService },
            ],
        }).compile()

        controller = module.get<ZvvController>(ZvvController)
        helpersService = module.get(HelpersService)
        dbService = module.get(DbService)
    })

    describe('getDeparture', () => {
        it('should parse departure with realtime data', async () => {
            const departure = {
                ProductAtStop: {
                    name: 'Tro 32',
                    catOut: 'tram',
                    icon: {
                        foregroundColor: { hex: '#ffffff' },
                        backgroundColor: { hex: '#0000ff' },
                    },
                },
                direction: 'Holzerhurd',
                date: '2026-01-05',
                time: '08:15:00',
                rtDate: '2026-01-05',
                rtTime: '08:17:00',
                track: '1',
                Stops: {
                    Stop: [
                        { extId: '8591052', name: 'Limmatplatz' },
                        {
                            extId: '8591234',
                            name: 'Holzerhurd',
                            arrDate: '2026-01-05',
                            arrTime: '08:30:00',
                        },
                    ],
                },
                Notes: { Note: [{ key: 'baim_1', value: 'Accessible' }] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.name).toBe('32')
            expect(result.type).toBe('tram')
            expect(result.departure.scheduled).toContain('2026-01-05T08:15:00')
            expect(result.departure.realtime).toContain('2026-01-05T08:17:00')
            expect(result.dt).toBe(result.departure.realtime)
            expect(result.to).toBe('Holzerhurd')
            expect(result.colors.fg).toBe('#ffffff')
            expect(result.colors.bg).toBe('#0000ff')
            expect(result.accessible).toBe(true)
            expect(result.platform).toBe('1')
            expect(result.source).toBe('zvv')
        })

        it('should use scheduled time when no realtime available', async () => {
            const departure = {
                ProductAtStop: {
                    name: 'Bus 46',
                    catOut: 'bus',
                },
                direction: 'Zurich HB',
                date: '2026-01-05',
                time: '09:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.name).toBe('46')
            expect(result.type).toBe('bus')
            expect(result.departure.scheduled).toContain('2026-01-05T09:00:00')
            expect(result.departure.realtime).toBeNull()
            expect(result.dt).toBe(result.departure.scheduled)
        })

        it('should strip Gl. prefix from platform', async () => {
            const departure = {
                ProductAtStop: { name: 'S5', catOut: 'train' },
                direction: 'Rapperswil',
                date: '2026-01-05',
                time: '10:00:00',
                platform: { type: 'track', text: 'Gl. 12' },
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.platform).toBe('12')
        })

        it('should use rtTrack over track and platform', async () => {
            const departure = {
                ProductAtStop: { name: 'IC', catOut: 'train' },
                direction: 'Bern',
                date: '2026-01-05',
                time: '10:00:00',
                rtTrack: '5',
                track: '3',
                platform: { type: 'track', text: 'Gl. 4' },
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.platform).toBe('5')
        })

        it('should default colors when icon not provided', async () => {
            const departure = {
                ProductAtStop: { name: 'S3', catOut: 'train' },
                direction: 'Wetzikon',
                date: '2026-01-05',
                time: '11:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.colors.fg).toBe('#000000')
            expect(result.colors.bg).toBe('#ffffff')
        })

        it('should handle HTML entities in direction', async () => {
            const departure = {
                ProductAtStop: { name: 'Bus 31', catOut: 'bus' },
                direction: 'Z&uuml;rich HB',
                date: '2026-01-05',
                time: '12:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.to).toBe('Zürich HB')
        })
    })

    describe('sanitizeLine', () => {
        it('should sanitize S-Bahn line names', async () => {
            const departure = {
                ProductAtStop: { name: 'S  5', catOut: 'train' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.name).toBe('S5')
        })

        it('should simplify IC train names', async () => {
            const departure = {
                ProductAtStop: { name: 'IC 8 12345', catOut: 'train' },
                direction: 'Bern',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.name).toBe('IC')
        })

        it('should simplify IR train names', async () => {
            const departure = {
                ProductAtStop: { name: 'IR 37 4567', catOut: 'train' },
                direction: 'Basel',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.name).toBe('IR')
        })

        it('should remove Tro prefix from trolleybus', async () => {
            const departure = {
                ProductAtStop: { name: 'Tro  32', catOut: 'tram' },
                direction: 'Holzerhurd',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.name).toBe('32')
        })

        it('should remove Bus prefix', async () => {
            const departure = {
                ProductAtStop: { name: 'Bus  46', catOut: 'bus' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.name).toBe('46')
        })
    })

    describe('mapType', () => {
        it('should map tram type correctly', async () => {
            const departure = {
                ProductAtStop: { name: '4', catOut: 'TRAM' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.type).toBe('tram')
        })

        it('should map bus type correctly', async () => {
            const departure = {
                ProductAtStop: { name: '46', catOut: 'BUS' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.type).toBe('bus')
        })

        it('should map boat type correctly', async () => {
            const departure = {
                ProductAtStop: { name: 'BAT', catOut: 'bat' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.type).toBe('boat')
        })

        it('should default unknown types to train', async () => {
            const departure = {
                ProductAtStop: { name: 'IC', catOut: 'unknown' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.type).toBe('train')
        })
    })

    describe('hasAccessible', () => {
        it('should return true when baim note exists', async () => {
            const departure = {
                ProductAtStop: { name: '32', catOut: 'tram' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
                Notes: { Note: [{ key: 'baim_2', value: 'Low floor' }] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.accessible).toBe(true)
        })

        it('should return false when no baim notes', async () => {
            const departure = {
                ProductAtStop: { name: '32', catOut: 'tram' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
                Notes: { Note: [{ key: 'other', value: 'Something' }] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.accessible).toBe(false)
        })

        it('should return false when Notes is undefined', async () => {
            const departure = {
                ProductAtStop: { name: '32', catOut: 'tram' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: { Stop: [] },
            }

            const result = await controller.getDeparture(departure)

            expect(result.accessible).toBe(false)
        })
    })

    describe('stationboard', () => {
        it('should return departures for valid station', async () => {
            helpersService.callApi.mockResolvedValue({
                Departure: [
                    {
                        ProductAtStop: { name: '32', catOut: 'tram' },
                        direction: 'Holzerhurd',
                        date: '2026-01-05',
                        time: '08:00:00',
                        Stops: { Stop: [{ name: 'Limmatplatz' }] },
                    },
                ],
            })

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.meta.station_id).toBe('8591052')
                expect(result.departures.length).toBe(1)
            }
        })

        it('should return error for station not found', async () => {
            helpersService.callApi.mockResolvedValue({
                errorCode: 'SVC_LOC',
                errorText: 'Location not found',
            })

            const result = await controller.stationboard('9999999')

            expect('error' in result).toBe(true)
            if ('error' in result) {
                expect(result.code).toBe('NOTFOUND')
            }
        })

        it('should return error for API errors', async () => {
            helpersService.callApi.mockResolvedValue({
                error: 'Connection timeout',
                source: 'https://zvv.hafas.cloud/...',
            })

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(true)
            if ('error' in result) {
                expect(result.error).toBe('Connection timeout')
            }
        })

        it('should handle empty departures array', async () => {
            helpersService.callApi.mockResolvedValue({ Departure: [] })

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures.length).toBe(0)
            }
        })

        it('should strip leading zeros from station ID', async () => {
            helpersService.callApi.mockResolvedValue({
                Departure: [],
            })

            await controller.stationboard('008591052')

            expect(helpersService.stationLimit).toHaveBeenCalledWith('8591052', 20)
        })

        it('should decrease station limit when departures span more than 4 hours', async () => {
            helpersService.stationLimit.mockResolvedValue('40')
            helpersService.callApi.mockResolvedValue({
                Departure: [
                    {
                        ProductAtStop: { name: '32', catOut: 'tram' },
                        direction: 'Test',
                        date: '2026-01-05',
                        time: '08:00:00',
                        Stops: { Stop: [{ name: 'Limmatplatz' }] },
                    },
                    {
                        ProductAtStop: { name: '32', catOut: 'tram' },
                        direction: 'Test',
                        date: '2026-01-05',
                        time: '14:00:00',
                        Stops: { Stop: [{ name: 'Limmatplatz' }] },
                    },
                ],
            })

            await controller.stationboard('8591052')

            expect(helpersService.setStationLimit).toHaveBeenCalledWith('8591052', 30)
        })
    })

    describe('stationboardStarttime', () => {
        it('should return departures from specific time', async () => {
            helpersService.callApi.mockResolvedValue({
                Departure: [
                    {
                        ProductAtStop: { name: '32', catOut: 'tram' },
                        direction: 'Holzerhurd',
                        date: '2026-01-05',
                        time: '14:00:00',
                        Stops: { Stop: [{ name: 'Limmatplatz' }] },
                    },
                ],
            })

            const result = await controller.stationboardStarttime(
                '8591052',
                '2026-01-05T14:00',
            )

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures.length).toBe(1)
            }
        })

        it('should increase limit for requests within 30 minutes', async () => {
            // Use moment to create a time 15 minutes in the future in Europe/Zurich timezone
            const moment = require('moment-timezone')
            const futureTime = moment.tz('Europe/Zurich').add(15, 'minutes')
            const starttimeStr = futureTime.format('YYYY-MM-DDTHH:mm')

            helpersService.stationLimit.mockResolvedValue('20')
            helpersService.callApi.mockResolvedValue({
                Departure: [],
            })

            await controller.stationboardStarttime('8591052', starttimeStr)

            // Should increase limit by 40 (15 min is < 30 min)
            expect(helpersService.setStationLimit).toHaveBeenCalledWith('8591052', 60)
        })

        it('should fall back to regular stationboard for past times', async () => {
            helpersService.callApi.mockResolvedValue({
                Departure: [
                    {
                        ProductAtStop: { name: '32', catOut: 'tram' },
                        direction: 'Test',
                        date: '2026-01-05',
                        time: '08:00:00',
                        Stops: { Stop: [{ name: 'Limmatplatz' }] },
                    },
                ],
            })

            const pastTime = new Date()
            pastTime.setHours(pastTime.getHours() - 1)
            const result = await controller.stationboardStarttime(
                '8591052',
                pastTime.toISOString().slice(0, 16),
            )

            // Should call stationboard internally (same API, just without specific time)
            expect('error' in result).toBe(false)
        })
    })

    describe('zvvToSbbId conversion', () => {
        it('should convert ZVV IDs in range 290000-300000', async () => {
            dbService.zvvToSbbId.mockResolvedValue('8503000')

            const departure = {
                ProductAtStop: { name: '32', catOut: 'tram' },
                direction: 'Test',
                date: '2026-01-05',
                time: '08:00:00',
                Stops: {
                    Stop: [{ extId: '295000', name: 'Test' }],
                },
            }

            const result = await controller.getDeparture(departure)

            expect(dbService.zvvToSbbId).toHaveBeenCalledWith('295000')
            expect(result.id).toBe('8503000')
        })
    })
})
