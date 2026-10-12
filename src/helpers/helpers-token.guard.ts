import { CanActivate, ExecutionContext, Injectable, Logger } from '@nestjs/common'
import { Request } from 'express'

/**
 * Protects the internal /api/helpers/* maintenance endpoints. They expose Redis
 * contents and generate SQL, so they must not be reachable anonymously.
 *
 * Fails closed: if HELPERS_TOKEN is not configured, access is always denied.
 * The caller must send the token in the `x-helpers-token` header.
 */
@Injectable()
export class HelpersTokenGuard implements CanActivate {
    private readonly logger = new Logger(HelpersTokenGuard.name)

    canActivate(context: ExecutionContext): boolean {
        const token = process.env.HELPERS_TOKEN
        if (!token) {
            this.logger.warn('HELPERS_TOKEN not set, denying access to /api/helpers/*')
            return false
        }
        const request = context.switchToHttp().getRequest<Request>()
        const provided = request.header('x-helpers-token')
        return typeof provided === 'string' && provided === token
    }
}
