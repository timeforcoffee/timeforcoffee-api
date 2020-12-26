import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
    const app = await NestFactory.create(AppModule)
    process.on('SIGINT', function () {
        console.log('Caught interrupt signal')
        process.exit()
    })
    await app.listen(3000)
}
bootstrap()
