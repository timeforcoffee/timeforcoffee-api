import { Test, TestingModule } from '@nestjs/testing'
import { OpentransportdataController } from './opentransportdata.controller'
import { HelpersService } from '../helpers/helpers.service'
import { DbService } from '../db/db.service'

describe('OpentransportdataController', () => {
    let controller: OpentransportdataController
    let helpersService: jest.Mocked<HelpersService>
    let dbService: jest.Mocked<DbService>

    // Mock XML response helper
    const createMockXmlResponse = (departures: any[], error?: string) => {
        if (error) {
            return `<?xml version="1.0" encoding="UTF-8"?>
<trias:Trias xmlns:trias="http://www.vdv.de/trias">
    <trias:ServiceDelivery>
        <trias:DeliveryPayload>
            <trias:StopEventResponse>
                <trias:ErrorMessage>
                    <trias:Text>
                        <trias:Text>${error}</trias:Text>
                    </trias:Text>
                </trias:ErrorMessage>
            </trias:StopEventResponse>
        </trias:DeliveryPayload>
    </trias:ServiceDelivery>
</trias:Trias>`
        }

        const departureXml = departures
            .map(
                d => `
            <trias:StopEventResult>
                <trias:StopEvent>
                    <trias:ThisCall>
                        <trias:CallAtStop>
                            <trias:StopPointName>
                                <trias:Text>${d.stationName}</trias:Text>
                            </trias:StopPointName>
                            <trias:ServiceDeparture>
                                <trias:TimetabledTime>${d.scheduled}</trias:TimetabledTime>
                                ${d.realtime ? `<trias:EstimatedTime>${d.realtime}</trias:EstimatedTime>` : ''}
                            </trias:ServiceDeparture>
                            ${d.platform ? `<trias:PlannedBay><trias:Text>${d.platform}</trias:Text></trias:PlannedBay>` : ''}
                        </trias:CallAtStop>
                    </trias:ThisCall>
                    <trias:Service>
                        <trias:PublishedLineName>
                            <trias:Text>${d.line}</trias:Text>
                        </trias:PublishedLineName>
                        <trias:DestinationText>
                            <trias:Text>${d.destination}</trias:Text>
                        </trias:DestinationText>
                        <trias:DestinationStopPointRef>${d.destinationId}</trias:DestinationStopPointRef>
                        <trias:Mode>
                            <trias:PtMode>${d.mode}</trias:PtMode>
                        </trias:Mode>
                    </trias:Service>
                    <trias:OnwardCall>
                        <trias:CallAtStop>
                            <trias:ServiceArrival>
                                <trias:TimetabledTime>${d.arrivalScheduled}</trias:TimetabledTime>
                                ${d.arrivalRealtime ? `<trias:EstimatedTime>${d.arrivalRealtime}</trias:EstimatedTime>` : ''}
                            </trias:ServiceArrival>
                        </trias:CallAtStop>
                    </trias:OnwardCall>
                </trias:StopEvent>
            </trias:StopEventResult>`,
            )
            .join('')

        return `<?xml version="1.0" encoding="UTF-8"?>
<trias:Trias xmlns:trias="http://www.vdv.de/trias">
    <trias:ServiceDelivery>
        <trias:DeliveryPayload>
            <trias:StopEventResponse>
                ${departureXml}
            </trias:StopEventResponse>
        </trias:DeliveryPayload>
    </trias:ServiceDelivery>
</trias:Trias>`
    }

    beforeEach(async () => {
        const mockHelpersService = {
            callApiPost: jest.fn(),
            stationLimit: jest.fn().mockResolvedValue('20'),
        }

        const mockDbService = {
            getApiKey: jest.fn().mockResolvedValue({
                id: '8591052',
                name: 'Limmatplatz',
            }),
        }

        const module: TestingModule = await Test.createTestingModule({
            controllers: [OpentransportdataController],
            providers: [
                { provide: HelpersService, useValue: mockHelpersService },
                { provide: DbService, useValue: mockDbService },
            ],
        }).compile()

        controller = module.get<OpentransportdataController>(OpentransportdataController)
        helpersService = module.get(HelpersService)
        dbService = module.get(DbService)
    })

    describe('stationboard', () => {
        it('should return departures for valid station', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Limmatplatz',
                        line: '32',
                        destination: 'Holzerhurd',
                        destinationId: '8591234',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:15:00.000+01:00',
                        realtime: '2026-01-05T08:17:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                        platform: '1',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.meta.station_id).toBe('8591052')
                expect(result.meta.station_name).toBe('Limmatplatz')
                expect(result.departures.length).toBe(1)
                expect(result.departures[0].name).toBe('32')
                expect(result.departures[0].to).toBe('Holzerhurd')
                expect(result.departures[0].source).toBe('otd')
            }
        })

        it('should return empty departures for unserved location', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([], 'STOPEVENT_LOCATIONUNSERVED'),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures).toEqual([])
            }
        })

        it('should return error for other error messages', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([], 'SOME_OTHER_ERROR'),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(true)
            if ('error' in result) {
                expect(result.error).toBe('SOME_OTHER_ERROR')
                expect(result.source).toBe('otd')
            }
        })

        it('should strip leading zeros from station ID', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '1',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'bus',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            await controller.stationboard('008591052')

            expect(helpersService.stationLimit).toHaveBeenCalledWith('8591052', 20)
        })

        it('should use custom limit', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '1',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'bus',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            await controller.stationboard('8591052', 50)

            expect(helpersService.stationLimit).toHaveBeenCalledWith('8591052', 50)
        })
    })

    describe('mapType', () => {
        it('should map rail to train', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: 'S5',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'rail',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].type).toBe('train')
            }
        })

        it('should pass through other types', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].type).toBe('tram')
            }
        })
    })

    describe('mapName', () => {
        it('should simplify S-Bahn names', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: 'S  5',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'rail',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].name).toBe('S5')
            }
        })

        it('should simplify IC train names', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: 'IC 8 12345',
                        destination: 'Bern',
                        destinationId: '123',
                        mode: 'rail',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].name).toBe('IC')
            }
        })

        it('should simplify IR train names', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: 'IR 37 6789',
                        destination: 'Basel',
                        destinationId: '123',
                        mode: 'rail',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].name).toBe('IR')
            }
        })
    })

    describe('departure fields', () => {
        it('should set default colors', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].colors.fg).toBe('#000000')
                expect(result.departures[0].colors.bg).toBe('#ffffff')
            }
        })

        it('should set accessible to false (not implemented)', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].accessible).toBe(false)
            }
        })

        it('should calculate dt from realtime or scheduled', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        realtime: '2026-01-05T08:02:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].dt).toContain('2026-01-05T08:02:00')
            }
        })

        it('should use scheduled when no realtime', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].dt).toContain('2026-01-05T08:00:00')
            }
        })

        it('should set platform from PlannedBay', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: 'S5',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'rail',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                        platform: '12',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].platform).toBe('12')
            }
        })

        it('should handle null platform', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].platform).toBeNull()
            }
        })
    })

    describe('arrival times', () => {
        it('should include arrival scheduled time', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].arrival.scheduled).toContain('2026-01-05T08:30:00')
            }
        })

        it('should include arrival realtime when available', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                        arrivalRealtime: '2026-01-05T08:32:00.000+01:00',
                    },
                ]),
            )

            const result = await controller.stationboard('8591052')

            expect('error' in result).toBe(false)
            if (!('error' in result)) {
                expect(result.departures[0].arrival.realtime).toContain('2026-01-05T08:32:00')
            }
        })
    })

    describe('API request', () => {
        it('should call API with correct headers', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            await controller.stationboard('8591052')

            expect(helpersService.callApiPost).toHaveBeenCalledWith(
                'https://api.opentransportdata.swiss/trias2020',
                expect.stringContaining('<StopPointRef>8591052</StopPointRef>'),
                expect.objectContaining({
                    headers: expect.objectContaining({
                        'Content-type': 'text/xml',
                    }),
                }),
            )
        })

        it('should include station ID in XML request', async () => {
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            await controller.stationboard('8507000')

            expect(helpersService.callApiPost).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('<StopPointRef>8507000</StopPointRef>'),
                expect.any(Object),
            )
        })

        it('should include limit in XML request', async () => {
            helpersService.stationLimit.mockResolvedValue('50')
            helpersService.callApiPost.mockResolvedValue(
                createMockXmlResponse([
                    {
                        stationName: 'Test',
                        line: '32',
                        destination: 'End',
                        destinationId: '123',
                        mode: 'tram',
                        scheduled: '2026-01-05T08:00:00.000+01:00',
                        arrivalScheduled: '2026-01-05T08:30:00.000+01:00',
                    },
                ]),
            )

            await controller.stationboard('8591052')

            expect(helpersService.callApiPost).toHaveBeenCalledWith(
                expect.any(String),
                expect.stringContaining('<NumberOfResults>50</NumberOfResults>'),
                expect.any(Object),
            )
        })
    })
})
