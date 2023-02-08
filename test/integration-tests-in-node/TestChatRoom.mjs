import gokv from "../../dist/index.mjs";

const room = gokv.ChatRoom("dev-chat");
const [chat1, chat2] = await Promise.all([room.connect(), room.connect()]);

const testMarkerId = `mk-${Date.now()}-${Math.random()}`;
const testMessage = "hey :)";

let testMessageId = null;

async function echo1() {
  for await (const msg of chat1.channel) {
    if (msg.marker?.id === testMarkerId) {
      testMessageId = msg.id;
      return msg.content;
    }
  }
}

async function echo2() {
  for await (const msg of chat2.channel) {
    if (msg.id === testMessageId) {
      return msg.content;
    }
  }
}

await test("chat room", async () => {
  Promise.resolve().then(() => chat1.send(testMessage, { markerId: testMarkerId }));
  assertEquals(await echo1(), testMessage);
  assertEquals(await echo2(), testMessage);
  assertEquals(chat1.onlineUsers.length, 1);
  assertEquals(chat2.onlineUsers.length, 1);
});
