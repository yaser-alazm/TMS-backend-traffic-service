const { Kafka } = require('kafkajs');

async function testKafkaConnection() {
  console.log('Testing Kafka connection...');
  
  const kafka = new Kafka({
    clientId: 'test-client',
    brokers: ['localhost:9092'],
    retry: {
      initialRetryTime: 100,
      retries: 3,
    },
  });

  const producer = kafka.producer({
    allowAutoTopicCreation: true,
    transactionTimeout: 30000,
    connectionTimeout: 10000,
    requestTimeout: 10000,
  });

  try {
    console.log('Connecting to Kafka...');
    await producer.connect();
    console.log('✅ Kafka producer connected successfully');

    console.log('Sending test message...');
    await producer.send({
      topic: 'test-topic',
      messages: [
        {
          key: 'test-key',
          value: JSON.stringify({
            message: 'Test message from traffic service',
            timestamp: new Date().toISOString(),
          }),
        },
      ],
    });
    console.log('✅ Test message sent successfully');

    await producer.disconnect();
    console.log('✅ Kafka producer disconnected');
    
    console.log('🎉 Kafka connection test completed successfully!');
  } catch (error) {
    console.error('❌ Kafka connection test failed:', error.message);
    console.error('Error details:', error);
    process.exit(1);
  }
}

testKafkaConnection();



