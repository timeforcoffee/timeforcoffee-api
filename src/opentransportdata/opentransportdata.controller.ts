import { Controller, Get, Param } from '@nestjs/common'
import { DEFAULT_DEPARTURES_LIMIT, HelpersService } from '../helpers/helpers.service'
import { DeparturesError, DeparturesType } from '../ch/ch.type'
import { OUTPUT_DATE_FORMAT, stripId } from '../ch/ch.service'
import { parseStringPromise } from 'xml2js'
import { DbService } from '../db/db.service'
import moment from 'moment-timezone'

function mapType(type: string): string {
    switch (type) {
        case 'rail':
            return 'train'
        default:
            return type
    }
}

function mapName(name: string): string {
    return name
        .replace(/S( )+/, 'S')
        .replace(/SN( )+/, 'SN')
        .replace(/IC.*/, 'IC')
        .replace(/IR.*/, 'IR')
        .replace(/ +/, ' ')
}

@Controller('/api/otd/')
export class OpentransportdataController {
    constructor(private helpersService: HelpersService, private dbService: DbService) {}

    @Get('stationboard/:id')
    async stationboard(
        @Param('id') id: string,
        defaultLimit: number | null = DEFAULT_DEPARTURES_LIMIT,
    ): Promise<DeparturesType | DeparturesError> {
        id = stripId(id)
        const limit = await this.helpersService.stationLimit(id, defaultLimit)
        const data = `<?xml version="1.0" encoding="UTF-8"?>
<Trias version="1.1" xmlns="http://www.vdv.de/trias" xmlns:siri="http://www.siri.org.uk/siri" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
    <ServiceRequest>
        <siri:RequestTimestamp>2020-09-29T12:44:46.206Z</siri:RequestTimestamp>
        <siri:RequestorRef>API-Explorer</siri:RequestorRef>
        <RequestPayload>
            <StopEventRequest>
                <Location>
                    <LocationRef>
                        <StopPointRef>${id}</StopPointRef>
                    </LocationRef>
<!--                    <DepArrTime>2020-11-04T14:04:11</DepArrTime>-->
                </Location>
                <Params>
                    <NumberOfResults>${limit}</NumberOfResults>
                    <StopEventType>departure</StopEventType>
                    <IncludePreviousCalls>false</IncludePreviousCalls>
                    <IncludeOnwardCalls>true</IncludeOnwardCalls>
                    <IncludeRealtimeData>true</IncludeRealtimeData>
                </Params>
            </StopEventRequest>
        </RequestPayload>
    </ServiceRequest>
</Trias>`
        const response = await this.helpersService.callApiPost(
            'https://api.opentransportdata.swiss/trias2020',
            data,
            {
                headers: {
                    Authorization: '57c5dbbbf1fe4d00010000187f09dc4f841545f96c36966cd046d71d',
                    'Content-type': 'text/xml',
                },
            },
        )

        const dom = await parseStringPromise(response)
        const stopEventResponse =
            dom['trias:Trias']['trias:ServiceDelivery'][0]['trias:DeliveryPayload'][0][
                'trias:StopEventResponse'
            ][0]
        if (stopEventResponse['trias:ErrorMessage']?.[0]['trias:Text'][0]) {
            if (
                stopEventResponse['trias:ErrorMessage']?.[0]['trias:Text'][0]['trias:Text'][0] ===
                'STOPEVENT_LOCATIONUNSERVED'
            ) {
                return {
                    meta: {
                        station_id: id,
                        station_name: (await this.dbService.getApiKey(id)).name || 'unknown',
                    },
                    departures: [],
                }
            }
            return {
                error: stopEventResponse['trias:ErrorMessage']?.[0]['trias:Text'][0][
                    'trias:Text'
                ][0],
                source: 'otd',
            }
        }
        const departures = stopEventResponse['trias:StopEventResult']

        const firstCall =
            departures[0]['trias:StopEvent'][0]['trias:ThisCall'][0]['trias:CallAtStop'][0]
        return {
            meta: {
                station_name: firstCall['trias:StopPointName'][0]['trias:Text'][0],
                station_id: id,
            },
            departures: departures.map(departure => {
                const stopEvent = departure['trias:StopEvent'][0]
                const service = stopEvent['trias:Service'][0]
                const call = stopEvent['trias:ThisCall'][0]
                const callAtStop = call['trias:CallAtStop'][0]
                const serviceDeparture = callAtStop['trias:ServiceDeparture'][0]
                const scheduled = serviceDeparture['trias:TimetabledTime'][0]
                const realtime = serviceDeparture['trias:EstimatedTime']
                    ? serviceDeparture['trias:EstimatedTime'][0]
                    : null

                const onWardCalls = stopEvent['trias:OnwardCall']
                const lastCall = onWardCalls[onWardCalls.length - 1]
                const lastCallArrival = lastCall['trias:CallAtStop'][0]['trias:ServiceArrival'][0]
                return {
                    departure: {
                        scheduled: moment
                            .tz(scheduled, OUTPUT_DATE_FORMAT, 'Europe/Zurich')
                            .format(OUTPUT_DATE_FORMAT),
                        realtime: realtime
                            ? moment
                                  .tz(realtime, OUTPUT_DATE_FORMAT, 'Europe/Zurich')
                                  .format(OUTPUT_DATE_FORMAT)
                            : undefined,
                    },
                    dt: moment
                        .tz(realtime || scheduled, OUTPUT_DATE_FORMAT, 'Europe/Zurich')
                        .format(OUTPUT_DATE_FORMAT),
                    id: service['trias:DestinationStopPointRef'][0],
                    to: service['trias:DestinationText'][0]['trias:Text'][0],
                    accessible: false, // TODO, it's in the xml
                    name: mapName(service['trias:PublishedLineName'][0]['trias:Text'][0]),
                    type: mapType(service['trias:Mode'][0]['trias:PtMode'][0]),
                    source: 'otd',
                    colors: { fg: '#000000', bg: '#ffffff' },
                    arrival: {
                        scheduled: moment
                            .tz(
                                lastCallArrival['trias:TimetabledTime'][0],
                                OUTPUT_DATE_FORMAT,
                                'Europe/Zurich',
                            )
                            .format(OUTPUT_DATE_FORMAT),
                        realtime: lastCallArrival['trias:EstimatedTime']
                            ? moment
                                  .tz(
                                      lastCallArrival['trias:EstimatedTime'][0],
                                      OUTPUT_DATE_FORMAT,
                                      'Europe/Zurich',
                                  )
                                  .format(OUTPUT_DATE_FORMAT)
                            : null,
                    },
                    platform: callAtStop['EstimatedBay']
                        ? callAtStop['trias:EstimatedBay'][0]['trias:Text'][0]
                        : callAtStop['trias:PlannedBay']?.[0]['trias:Text'][0] || null,
                }
            }),
        }
    }
}
