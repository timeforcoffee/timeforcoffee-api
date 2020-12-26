import { Controller, Get, Next, Req, Res } from '@nestjs/common'
import { NextFunction } from 'express'
import { join } from 'path'
import { Response, Request } from 'express'

@Controller('')
export class FrontendController {
    @Get('*')
    get(@Res() res: Response, @Next() next: NextFunction, @Req() req: Request) {
        // here you can check if the requested path is your api endpoint, if that's the case then we have to return next()

        if (req.path.includes('api')) {
            return next()
        }

        let path = req.path
        if (path.endsWith('/')) {
            path += 'index.html'
        }
        // change the path to the correct html page path in your project
        res.sendFile(join(process.cwd(), './www' + path))
    }
}
