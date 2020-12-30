import { Injectable, Logger } from '@nestjs/common'
import * as sqlite3 from 'sqlite3'

const db = new sqlite3.Database('./stations.sqlite', sqlite3.OPEN_READONLY, err => {
    if (err) {
        console.error(err.message)
    }
    console.log('Connected to the stations database.')
})

const ZVV_ONLY = ['SBB', 'VBZ', 'VZO']

@Injectable()
export class DbService {
    private readonly logger = new Logger(DbService.name)

    async zvvToSbbId(id: string): Promise<string | null> {
        const idN = parseInt(id)
        if (idN < 300000 && idN > 290000) {
            return new Promise(function (resolve, reject) {
                db.all(
                    'select sbb_id from zvv_to_sbb where zvv_id = ?',
                    [id],
                    function (err, rows) {
                        if (err) {
                            reject(err)
                        } else {
                            if (rows[0]) {
                                resolve(rows[0].sbb_id)
                            } else {
                                resolve(null)
                            }
                        }
                    },
                )
            })
        }
        return id
    }

    async getApiKey(
        id: string,
    ): Promise<{ apikey: string; apiid: string; name: string; id: string }> {
        const idN = parseInt(id)
        const logger = this.logger
        const mod = this
        return new Promise(function (resolve, reject) {
            db.all(
                'select zid as id, zcounty as county, zname as name, zapikey as apikey, zapiid as apiid, zaltsbbid as altsbbid, zgo as go from ZTFCSTATIONMODEL where ZID = ?',
                [idN],
                async function (err, rows) {
                    if (err) {
                        reject(err)
                    } else {
                        const idString = idN.toString()
                        if (rows[0]) {
                            if (rows[0].altsbbid) {
                                resolve(await mod.getApiKey(rows[0].altsbbid))
                            }
                            logger.debug(
                                `Found for ${idN} stop: ${rows[0].name}. ${
                                    rows[0].apikey ? 'key:' + rows[0].apikey : ''
                                } ${rows[0].apiid ? 'id:' + rows[0].apiid : ''}`,
                            )
                            if (rows[0].apikey) {
                                if (!rows[0].apiid) {
                                    rows[0].apiid = id
                                }
                                resolve(rows[0])
                            } else if (
                                rows[0].county !== 'Zürich' &&
                                rows[0].county !== 'Zurich' &&
                                !ZVV_ONLY.includes(rows[0].go)
                            ) {
                                // if not from Zürich, also call search
                                resolve({
                                    apikey: 'search',
                                    apiid: idString,
                                    id: idString,
                                    name: rows[0].name,
                                })
                            } else {
                                resolve({
                                    apikey: 'zvv',
                                    apiid: idString,
                                    id: idString,
                                    name: rows[0].name,
                                })
                            }
                        } else {
                            resolve({
                                apikey: 'zvv',
                                apiid: idString,
                                name: idString,
                                id: idString,
                            })
                        }
                    }
                },
            )
        })
    }
}
