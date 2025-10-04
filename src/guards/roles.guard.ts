import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard as CommonRolesGuard } from '@yatms/common';

@Injectable()
export class RolesGuard extends CommonRolesGuard {
  constructor(reflector: Reflector) {
    super(reflector);
  }
}

