import { NestFactory } from '@nestjs/core'
import { NestExpressApplication } from '@nestjs/platform-express'
import { AppModule } from './app.module'
import compression from 'compression'

async function bootstrap() {
    const app = await NestFactory.create<NestExpressApplication>(AppModule)
    app.use(compression())
    // We run behind the nginx ingress; trust the first proxy hop so the real
    // client IP (x-forwarded-for) is used for rate limiting.
    app.set('trust proxy', 1)

    process.on('SIGINT', function () {
        console.log('Caught interrupt signal')
        process.exit()
    })
    await app.listen(3000)
}
bootstrap()
