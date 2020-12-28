import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'
import compression from 'compression'
import * as dotenv from 'dotenv'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    app.use(compression())

    process.on('SIGINT', function () {
        console.log('Caught interrupt signal')
        process.exit()
    })
    await app.listen(3000)
}
bootstrap()
