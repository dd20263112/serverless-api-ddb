exports.handler = async (event) => {
  // event is the EventBridge envelope
  console.log("Received EventBridge event:", JSON.stringify(event, null, 2));

  const { itemId, createdAt } = event.detail || {};

  // "process" step (POC): log meaningful fields
  console.log(`AUDIT: ItemCreated for itemId=${itemId}, createdAt=${createdAt}`);

  return;
};
