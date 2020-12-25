import { Injectable } from '@nestjs/common'
import * as sqlite3 from 'sqlite3'

const db = new sqlite3.Database('./stations.sqlite', sqlite3.OPEN_READONLY, err => {
    if (err) {
        console.error(err.message)
    }
    console.log('Connected to the stations database.')
})

@Injectable()
export class DbService {
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

    async getApiKey(id: string): Promise<{ apikey: string; apiid: string }> {
        // select zapikey as apikey, zapiid as apiid from ZTFCSTATIONMODEL where ZID =
        const idN = parseInt(id)
        return new Promise(function (resolve, reject) {
            db.all(
                'select zapikey as apikey, zapiid as apiid from ZTFCSTATIONMODEL where ZID = ?',
                [idN],
                function (err, rows) {
                    if (err) {
                        reject(err)
                    } else {
                        console.log(rows[0])
                        if (rows[0] && rows[0].apikey) {
                            if (!rows[0].apiid) {
                                rows[0].apiid = id
                            }
                            resolve(rows[0])
                        } else {
                            resolve({ apikey: 'zvv', apiid: idN.toString() })
                        }
                    }
                },
            )
        })
    }
}
