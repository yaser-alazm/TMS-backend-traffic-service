import { Module } from '@nestjs/common';
import { KafkaService } from '@yatms/common';

@Module({
  providers: [KafkaService],
  exports: [KafkaService],
})
export class KafkaModule {}



