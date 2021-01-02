import { Controller, Get, Param } from '@nestjs/common'
import { HelpersService } from '../helpers/helpers.service'
import { DeparturesType } from '../ch/ch.type'
import { stripId } from '../ch/ch.service'
import { parseStringPromise } from 'xml2js'

@Controller('/api/otd/')
export class OpentransportdataController {
    constructor(private helpersService: HelpersService) {}

    @Get('stationboard/:id')
    async stationboard(@Param('id') id: string): Promise<any> {
        id = stripId(id)
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
                    <NumberOfResults>40</NumberOfResults>
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
        const departures =
            dom['trias:Trias']['trias:ServiceDelivery'][0]['trias:DeliveryPayload'][0][
                'trias:StopEventResponse'
            ][0]['trias:StopEventResult']

        const firstCall =
            departures[0]['trias:StopEvent'][0]['trias:ThisCall'][0]['trias:CallAtStop'][0]
        return {
            meta: {
                station_name: firstCall['trias:StopPointName'][0]['trias:Text'][0],
                station_id: id,
            },
            departures: departures.map(departure => {
                const stopEvent = departure['trias:StopEvent'][0]
                // console.log(stopEvent)
                const service = stopEvent['trias:Service'][0]
                const call = stopEvent['trias:ThisCall'][0]
                const serviceDeparture = call['trias:CallAtStop'][0]['trias:ServiceDeparture'][0]
                const scheduled = serviceDeparture['trias:TimetabledTime'][0]
                const realtime = serviceDeparture['trias:EstimatedTime']
                    ? serviceDeparture['trias:EstimatedTime'][0]
                    : null

                const onWardCalls = stopEvent['trias:OnwardCall']
                const lastCall = onWardCalls[onWardCalls.length - 1]
                const lastCallArrival = lastCall['trias:CallAtStop'][0]['trias:ServiceArrival'][0]
                return {
                    departure: {
                        scheduled,
                        realtime,
                    },
                    dt: realtime || scheduled,
                    id: service['trias:DestinationStopPointRef'][0],
                    to: service['trias:DestinationText'][0]['trias:Text'][0],
                    accessible: null, // TODO, it's in the xml
                    name: service['trias:PublishedLineName'][0]['trias:Text'][0],
                    type: service['trias:Mode'][0]['trias:PtMode'][0],
                    source: 'otd',
                    arrival: {
                        scheduled: lastCallArrival['trias:TimetabledTime'][0],
                        realtime: lastCallArrival['trias:EstimatedTime']
                            ? lastCallArrival['trias:EstimatedTime'][0]
                            : undefined,
                    },
                }
            }),
        }
    }
}
