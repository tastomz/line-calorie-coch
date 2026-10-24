import { Controller, Get, Redirect } from '@nestjs/common';

@Controller()
export class AppController {
  /** The site root shows the public Pro page (pricing, what the service is). */
  @Get()
  @Redirect('/membership', 302)
  root() {
    return undefined;
  }
}
