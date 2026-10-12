import { Controller, Get, Next, Req, Res } from '@nestjs/common'
import { NextFunction } from 'express'
import { join, normalize, sep } from 'path'
import { Response, Request } from 'express'

const WWW_ROOT = join(process.cwd(), 'www')

@Controller('')
export class FrontendController {
    @Get('*')
    get(@Res() res: Response, @Next() next: NextFunction, @Req() req: Request) {
        // here you can check if the requested path is your api endpoint, if that's the case then we have to return next()

        if (req.path.startsWith('/api')) {
            return next()
        }

        let path = req.path
        if (path.endsWith('/')) {
            path += 'index.html'
        }

        // Resolve inside WWW_ROOT and make sure we never escape it (path traversal)
        const target = normalize(join(WWW_ROOT, path))
        if (target !== WWW_ROOT && !target.startsWith(WWW_ROOT + sep)) {
            return next()
        }

        res.header('Cache-Control', 'public, max-age=3600')
        res.sendFile(target)
    }
}
