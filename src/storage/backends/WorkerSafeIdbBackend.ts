import { RNGImpl } from 'crypto/random';
import { Literal } from 'data/model';
import { Store, StoredOpHeader } from 'storage/store/Store';
import { Backend } from './Backend';
import { IdbBackend } from './IdbBackend';
import { SafeBroadcastChannel } from 'util/broadcastchannel';


class WorkerSafeIdbBackend extends IdbBackend implements Backend {

    static backendName = 'worker-safe-idb';

    static channelName = 'idb-backend-trigger';
    static broadcastId: string;
    static broadcastChannel: BroadcastChannel;

    static init(): void {
        if (WorkerSafeIdbBackend.broadcastId === undefined) {
            
            WorkerSafeIdbBackend.broadcastId = new RNGImpl().randomHexString(128);
            WorkerSafeIdbBackend.broadcastChannel = new SafeBroadcastChannel(WorkerSafeIdbBackend.channelName);
            
            WorkerSafeIdbBackend.broadcastChannel.onmessage = (ev: MessageEvent<any>) => {
                
                if (ev.data.broadcastId !== undefined &&
                    ev.data.broadcastId !== WorkerSafeIdbBackend.broadcastId) {
                    
                    IdbBackend.fireCallbacks(ev.data.dbName, ev.data.literal);
                
                }
            };
        }
    }

    constructor(name: string) {
        super(name);

        WorkerSafeIdbBackend.init();
    }

    getBackendName() {
        return WorkerSafeIdbBackend.backendName;
    }

    async store(literal: Literal, history?: StoredOpHeader): Promise<void> {
        await super.store(literal, history);

        WorkerSafeIdbBackend.broadcastChannel.postMessage({
            broadcastId: WorkerSafeIdbBackend.broadcastId,
            dbName: this.name,
            literal: literal
        });
    }
    
}

Store.registerBackend(WorkerSafeIdbBackend.backendName, (dbName: string) => new WorkerSafeIdbBackend(dbName));


export { WorkerSafeIdbBackend };