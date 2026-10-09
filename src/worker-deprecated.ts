/** @deprecated Obsolete: The file src/worker.ts has been deprecated.
 * The logic of the asynchronous consumer that contained the loop `channel.consume`
 * has been embedded in the private method `startAsynchronousConsumerWorker()`
 * within this service, running in a unified manner during the main server startup.
 */

// 1. Imports: Here we bring the connection tools of our queue, the in-memory repository,
// And the service that manages the user creation rules.
import { getRabbitChannel, QUEUE_NAME } from './queue/rabbit-deprecated.js';
import { UserRepository } from './repositories/UserRepository.js';
import { UserService } from './services/UserService.js';

// 🔥 CLEAN ARCHITECTURE: Imports 'io' directly from our isolated configuration file!
// We put the '.js' suffix because we are using Node's Native Modules (ESM) in the project. 
import { io } from './graphql/socket-deprecated.js';


// 2. INITIALIZER FUNCTION OF THE WORKER ENGINE:
// The function 'startWorker' is responsible for starting the asynchronous consumer that listens to the RabbitMQ queue.
async function startWorker() {
  console.log('👷 Worker iniciado com sucesso! Escutando a fila de eventos...');

  
  try {
    // Step A: We instantiate the dependencies of our architecture.
    // The worker needs the service to process the saving, and the service needs the repository.
    const userRepository = new UserRepository();
    const userService = new UserService(userRepository);

    // Step B: Opens a dedicated data transmission channel with the RabbitMQ server.
    // This channel is what will allow the Worker to listen to the event queue and capture messages sent by the Producer (API).
    const channel = await getRabbitChannel();

    // Step C: Activates the consumption of messages from the queue. The 'channel.consume' function remains active in an eternal loop,
    // waiting for new messages to fall into the RabbitMQ conveyor belt to capture them.
    // For each new message, the callback function is automatically triggered.
    channel.consume(QUEUE_NAME, async (message) => {
      
      // Security validation: Checks if the captured message is not empty or null.
      // If the message is null, it means that RabbitMQ could not deliver anything to the Worker, and therefore there is nothing to process.
      if (message !== null) {
        try {
          // Step D: Converts the Buffer (pure binary data sent over the network) back into a String,
          // and then transforms it into a native JavaScript JSON object.
          // The JSON sent by the Producer (API) contains the 'action' property that indicates which business rule the Worker should execute.
          // The 'data' property contains the user data that the Producer (API) sent for the Worker to process.
          const content = JSON.parse(message.content.toString());
          console.log(`📥 Nova mensagem capturada da fila! Ação identificada: ${content.action}`);
  
          // Step E: Internal routing. Checks if the action sent by the Producer (API) is indeed 'create'.
          // If it is, the Worker will execute the business rule to create a new user in the database.
          if (content.action === 'create') {            
            // Extracts the 'name' and 'email' variables that were wrapped inside the 'data' property.
            // The 'data' property is a JSON object that contains the user data sent by the Producer (API) to the Worker.
            const { name, email } = content.data;

            console.log(`⏳ Processando dados em segundo plano para o e-mail: ${email}...`);
        
            // STEP F (REAL PERSISTENCE): Triggers the business layer to process the rule,
            // generate the unique random ID, and save the user definitively in the database/memory.            
            const newUser = await userService.createUser(name, email);
            console.log(`✅ Usuário cadastrado no banco com sucesso via Fila! Novo ID Gerado: ${newUser.id}`);
                         
            // 🔥 (REAL-TIME WEBSOCKET TRIGGER): Emits a global event called 'user_created'.
            // All connected browsers will receive this alert containing the new user's data!
            io?.emit('user_created',{
              id: newUser.id,
              name: newUser.name,
              email: newUser.email
            });
          }

          // CONFIRMATION OF RECEIPT (Acknowledgment / Ack): Notifies RabbitMQ that the message has been processed successfully.
          // RabbitMQ receives the 'ack' and safely deletes the message from the conveyor belt so that it does not repeat.
          channel.ack(message);

        } catch (error) {
          console.error('❌ Falha crítica ao tentar processar a mensagem do Worker:', error);
          // REJECTION OF MESSAGE (Negative Acknowledgment / Nack):
          // If the JSON is broken or there is a serious code error, we notify RabbitMQ to reject it.
          // The parameters (false, false) tell RabbitMQ NOT to put the message back in the main queue,
          // sending it directly to the Dead-Letter Queue (quarantine bin) for bug analysis.
          channel.nack(message, false, false);
        }
      }
    });

  } catch (error) {
    console.error('❌ Erro crítico ao tentar conectar e inicializar o motor do Worker:', error);
  }
}
// Initializes the immediate execution of our background listening process
// The 'startWorker' function is called to start the asynchronous consumer that listens to the RabbitMQ queue.
startWorker();
