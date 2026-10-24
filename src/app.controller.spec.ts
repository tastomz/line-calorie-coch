import { RedirectMetadata } from '@nestjs/common/interfaces/router/redirect-metadata.interface';
import { REDIRECT_METADATA } from '@nestjs/common/constants';
import { AppController } from './app.controller';

describe('AppController', () => {
  it('redirects the site root to the public membership page', () => {
    const meta = Reflect.getMetadata(
      REDIRECT_METADATA,
      AppController.prototype.root,
    ) as RedirectMetadata;
    expect(meta).toEqual({ url: '/membership', statusCode: 302 });
  });
});
