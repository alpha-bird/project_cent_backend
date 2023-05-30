import { DynamoDB } from 'aws-sdk';

const batchSize = 25;
const concurrentRequests = 10;

async function batchWriteItemsIntoDynamoDB(DynamoDBClient: AWS.DynamoDB, tableName: string, items: any[]): Promise<DynamoDB.BatchWriteItemOutput> {
  const putRequests = items.map(item => ({
    PutRequest: {
      Item: DynamoDB.Converter.marshall(item)
    }
  }))

  const batchWriteItemParams = {
    RequestItems: {
      [tableName]: putRequests
    }
  }

  return DynamoDBClient.batchWriteItem(batchWriteItemParams).promise()
};

async function bulkWriting(DynamoDBClient: AWS.DynamoDB, tableName: string, items: any[]): Promise<void> {
  let subItems = [];
  let batchNo = 0;
  let batchTasks = [];

  for await (const item of items) {
    subItems.push(item);

    if (subItems.length % batchSize === 0) {
      console.log(`batch ${batchNo}`);

      batchTasks.push(batchWriteItemsIntoDynamoDB(DynamoDBClient, tableName, subItems));
      if (batchTasks.length % concurrentRequests === 0) {
        console.log('\nawaiting write requests to DynamoDB\n');
        await Promise.all(batchTasks);
        batchTasks = [];
      }

      subItems = [];
      batchNo ++;
    }
  }

  if (subItems.length > 0) {
    console.log(`batch ${batchNo}`)
    batchTasks.push(batchWriteItemsIntoDynamoDB(DynamoDBClient, tableName, subItems))
  }

  if (batchTasks.length > 0) {
    console.log('\nawaiting write to DynamoDB\n');
    await Promise.all(batchTasks);
  }

  console.log('Bulk Writing Done!');
}

export {
  batchWriteItemsIntoDynamoDB,
  bulkWriting
};
