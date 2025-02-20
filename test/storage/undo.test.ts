import { describeProxy } from 'config';
import { RNGImpl } from 'crypto/random';
import { Identity, RSAKeyPair } from 'data/identity';
import { PermissionedFeatureSet } from 'data/types/PermissionedFeatureSet';
import { PermissionTest } from 'data/types/PermissionTest';
import { PeerGroupAgent } from 'mesh/agents/peer';
import { HeaderBasedSyncAgent, StateGossipAgent, TerminalOpsSyncAgent } from 'mesh/agents/state';
import { TestPeerGroupPods } from 'mesh/mock/TestPeerGroupPods';
import { Resources } from 'spaces/Resources';
import { IdbBackend, MemoryBackend } from 'storage/backends';
import { Store } from 'storage/store';

describeProxy('[UND] Undo support', () => {
    test( '[UND01] Basic undo w/ IndexedDB backend', async (done) => {

        let store = new Store(new IdbBackend('test-basic-undo'));
        
        await testBasicUndoCycle(store);

        store.close();

        done();
    }, 30000);

    test( '[UND02] Basic undo w/ memory backend', async (done) => {

        let store = new Store(new MemoryBackend('test-basic-undo'));
        
        await testBasicUndoCycle(store);

        store.close();

        done();
    }, 30000);

    test( '[UND03] Basic undo w/ IndexedDB backend over sync', async (done) => {

        let stores = [new Store(new IdbBackend('test-basic-undo-over-sync-1')),
                      new Store(new IdbBackend('test-basic-undo-over-sync-2'))];
        
        await testBasicUndoCycleWithSync(stores);

        for (const store of stores) {
            store.close();
        }

        done();
    }, 50000);

    test( '[UND04] Basic undo w/ memory backend over sync', async (done) => {

        let stores = [new Store(new MemoryBackend('test-basic-undo-over-sync-1')),
                      new Store(new MemoryBackend('test-basic-undo-over-sync-2'))];
        
        await testBasicUndoCycleWithSync(stores);

        for (const store of stores) {
            store.close();
        }

        done();
    }, 50000);

    test( '[UND05] Multi object undo cascade w/ IndexedDB backend', async (done) => {

        let store = new Store(new IdbBackend('test-basic-undo'));
        
        await testMultiObjectUndoCascade(store);

        store.close();

        done();
    }, 30000);

    test( '[UND06] Multi object undo cascade  w/ memory backend', async (done) => {

        let store = new Store(new MemoryBackend('test-basic-undo'));
        
        await testMultiObjectUndoCascade(store);

        store.close();

        done();
    }, 30000);

    test( '[UND07] Multi object undo cascade w/ IndexedDB backend over sync', async (done) => {

        let stores = [new Store(new IdbBackend('test-basic-undo-over-sync-1')),
                      new Store(new IdbBackend('test-basic-undo-over-sync-2'))];
        
        await testMultiObjectUndoCascadeWithSync(stores);

        for (const store of stores) {
            store.close();
        }

        done();
    }, 50000);

    test( '[UND8] Multi object undo cascade w/ memory backend over sync', async (done) => {

        let stores = [new Store(new MemoryBackend('test-basic-undo-over-sync-1')),
                      new Store(new MemoryBackend('test-basic-undo-over-sync-2'))];
        
        await testMultiObjectUndoCascadeWithSync(stores);

        for (const store of stores) {
            store.close();
        }

        done();
    }, 50000);
});

async function testBasicUndoCycle(store: Store) {

    const rootKeyPair = await RSAKeyPair.generate(1024);
    const rootId = Identity.fromKeyPair({role:'root'}, rootKeyPair);

    const adminKeyPair = await RSAKeyPair.generate(1024);
    const adminId = Identity.fromKeyPair({role:'admin'}, adminKeyPair);

    const userKeyPair = await RSAKeyPair.generate(1024);
    const userId = Identity.fromKeyPair({role:'user'}, userKeyPair);


    const temporaryUserKeyPair = await RSAKeyPair.generate(1024);
    const temporaryUserId = Identity.fromKeyPair({role:'user'}, temporaryUserKeyPair);
    await store.save(rootKeyPair);
    await store.save(rootId);

    await store.save(adminKeyPair);
    await store.save(adminId);

    await store.save(userKeyPair);
    await store.save(userId);

    const permissions = new PermissionTest();
    permissions.setAuthor(rootId);

    await permissions.addAdmin(adminId);
    await permissions.addUser(userId, adminId);
    await store.save(permissions);

    const permissionsClone = await store.load(permissions.hash()) as PermissionTest;
    await permissionsClone.loadAllChanges();

    await permissions.addUser(temporaryUserId, adminId);
    await store.save(permissions);

    permissions.watchForChanges(true);

    expect(permissions.isUser(userId));
    expect(permissions.isUser(temporaryUserId));

    expect(permissionsClone.isUser(userId));
    expect(!permissionsClone.isUser(temporaryUserId));

    await permissionsClone.removeAdmin(adminId);

    await store.save(permissionsClone);

    let i = 0;

    while (permissions.isUser(temporaryUserId) && i < 20) {
        await new Promise(r => setTimeout(r, 100));
    }

    expect(!permissions.isUser(temporaryUserId));
    expect(permissions.isUser(userId));

}

async function testBasicUndoCycleWithSync(stores: Store[]) {


    // create pods and add gossip agent

    const size = 2;
        
    let peerNetworkId = new RNGImpl().randomHexString(64);

    let pods = await TestPeerGroupPods.generate(peerNetworkId, size, size, size-1, 'wrtc', 'no-discovery');
    
    for (let i=0; i<size; i++) {
        const peerNetwork = pods[i].getAgent(PeerGroupAgent.agentIdForPeerGroup(peerNetworkId)) as PeerGroupAgent;
        let gossip = new StateGossipAgent(peerNetworkId, peerNetwork);
        
        pods[i].registerAgent(gossip);
    }

    // create identities and permissions objects

    const rootKeyPair = await RSAKeyPair.generate(1024);
    const rootId = Identity.fromKeyPair({role:'root'}, rootKeyPair);

    const adminKeyPair = await RSAKeyPair.generate(1024);
    const adminId = Identity.fromKeyPair({role:'admin'}, adminKeyPair);

    const userKeyPair = await RSAKeyPair.generate(1024);
    const userId = Identity.fromKeyPair({role:'user'}, userKeyPair);


    const temporaryUserKeyPair = await RSAKeyPair.generate(1024);
    const temporaryUserId = Identity.fromKeyPair({role:'user'}, temporaryUserKeyPair);

    const permissions = new PermissionTest();
    permissions.setAuthor(rootId);

    // set up sync in pods

    for (let i=0; i<size; i++) {
        TerminalOpsSyncAgent.toString
        const peerGroupAgent = pods[i].getAgent(PeerGroupAgent.agentIdForPeerGroup(peerNetworkId)) as PeerGroupAgent;
        
        //let agent = new TerminalOpsSyncAgent(peerGroupAgent, s.hash(), stores[i], MutableSet.opClasses);
        let agent = new HeaderBasedSyncAgent(peerGroupAgent, permissions.hash(), await Resources.create({store: stores[i]}), permissions.getAcceptedMutationOpClasses());
        let gossip = pods[i].getAgent(StateGossipAgent.agentIdForGossip(peerNetworkId)) as StateGossipAgent;
        gossip.trackAgentState(agent.getAgentId());
        //agent;
        pods[i].registerAgent(agent);
    }

    // add some permissions, persist to 'local' store
    
    const localStore = stores[0];
    const remoteStore = stores[1];

    await localStore.save(rootKeyPair);
    await localStore.save(rootId);

    await localStore.save(adminKeyPair);
    await localStore.save(adminId);

    await localStore.save(userKeyPair);
    await localStore.save(userId);


    await permissions.addAdmin(adminId);
    await permissions.addUser(userId, adminId);
    await localStore.save(permissions);
    

    expect(permissions.isUser(userId));

    await remoteStore.save(rootKeyPair); // need this to perform root ops on the remote store

    // wait for permissions object to replicate to 'remote' store

    let i = 0;

    while (await remoteStore.load(permissions.hash()) === undefined && i < 200) {
        await new Promise(r => setTimeout(r, 100));
        i = i + 1;
    }

    // load a clone of the permissions object from the 'remote' store

    const permissionsClone = await remoteStore.load(permissions.hash()) as PermissionTest;
    await permissionsClone.loadAndWatchForChanges();

    // wait until the user permission for userId is replicated
    i = 0;

    while (!permissionsClone.isUser(userId) && i < 200) {
        await new Promise(r => setTimeout(r, 100));
        i = i + 1;
    }

    expect(permissionsClone.isUser(userId));

    // revoke the user permission for admin in the remote

    await permissionsClone.removeAdmin(adminId);
    await remoteStore.save(permissionsClone);

    // add another user on the local store, where the admin revokation is not loaded yet

    await permissions.addUser(temporaryUserId, adminId);
    await localStore.save(permissions);

    expect(permissions.isUser(temporaryUserId));

    permissions.loadAndWatchForChanges();
    
    i = 0;

    while (permissions.isUser(temporaryUserId) && i < 100) {
        await new Promise(r => setTimeout(r, 100));
        i = i + 1;
    }

    expect(!permissions.isUser(temporaryUserId));
    expect(permissions.isUser(userId));

    for (const pod of pods) {
        pod.shutdown();
    }
}

async function testMultiObjectUndoCascade(store: Store) {

    const rootKeyPair = await RSAKeyPair.generate(1024);
    const rootId = Identity.fromKeyPair({role:'root'}, rootKeyPair);

    const adminKeyPair = await RSAKeyPair.generate(1024);
    const adminId = Identity.fromKeyPair({role:'admin'}, adminKeyPair);

    await store.save(rootKeyPair);
    await store.save(rootId);

    await store.save(adminKeyPair);
    await store.save(adminId);

    const permissions = new PermissionTest();
    permissions.setAuthor(rootId);

    await permissions.addAdmin(adminId);
    await store.save(permissions);

    const permissionsClone = await store.load(permissions.hash()) as PermissionTest;
    await permissionsClone.loadAllChanges();

    permissions.watchForChanges(true);

    const features = new PermissionedFeatureSet(permissions);

    await store.save(features);

    features.watchForChanges(true);

    const useFeatureOpFail = features.useFeatureIfEnabled('anon-read', 'sample-usage-key');

    expect(useFeatureOpFail === undefined);

    features.enableFeature('anon-write', adminId)

    const useFeatureOp = features.useFeatureIfEnabled('anon-write', 'sample-usage-key');

    expect(useFeatureOp !== undefined);

    const featuresClone = await store.load(features.hash()) as PermissionedFeatureSet;
    featuresClone.users = permissionsClone;

    expect(featuresClone.useFeatureIfEnabled('anon-write', 'another-usage-key') === undefined);

    await store.save(features);
    await featuresClone.loadAllChanges();

    expect(featuresClone.useFeatureIfEnabled('anon-write', 'yet-another-usage-key') !== undefined);

    featuresClone.enableFeature('anon-read', adminId);

    await store.save(featuresClone);

    expect(featuresClone.isEnabled('anon-read') === true);

    permissions.removeAdmin(adminId);
    await store.save(permissions);

    await featuresClone.loadAllChanges();

    /*let i = 0;

    while (featuresClone.isEnabled('anon-read') && i < 100) {
        await new Promise(r => setTimeout(r, 100));
    }*/

    expect(featuresClone.isEnabled('anon-read') === false);
    expect(featuresClone.isEnabled('anon-write' ));

}

async function testMultiObjectUndoCascadeWithSync(stores: Store[]) {


    // create pods and add gossip agent

    const size = 2;
        
    let peerNetworkId = new RNGImpl().randomHexString(64);

    let pods = await TestPeerGroupPods.generate(peerNetworkId, size, size, size-1, 'wrtc', 'no-discovery');
    
    for (let i=0; i<size; i++) {
        const peerNetwork = pods[i].getAgent(PeerGroupAgent.agentIdForPeerGroup(peerNetworkId)) as PeerGroupAgent;
        let gossip = new StateGossipAgent(peerNetworkId, peerNetwork);
        
        pods[i].registerAgent(gossip);
    }

    const localStore = stores[0];
    const remoteStore = stores[1];

    const rootKeyPair = await RSAKeyPair.generate(1024);
    const rootId = Identity.fromKeyPair({role:'root'}, rootKeyPair);

    const adminKeyPair = await RSAKeyPair.generate(1024);
    const adminId = Identity.fromKeyPair({role:'admin'}, adminKeyPair);

    await localStore.save(rootKeyPair);
    await localStore.save(rootId);

    await localStore.save(adminKeyPair);
    await localStore.save(adminId);

    const permissions = new PermissionTest();
    permissions.setAuthor(rootId);

    await permissions.addAdmin(adminId);
    await localStore.save(permissions);

    // for setting features later
    await remoteStore.save(adminKeyPair);

    permissions.watchForChanges(true);

    const features = new PermissionedFeatureSet(permissions);

    await localStore.save(features);

    await features.enableFeature('anon-write', adminId)

    await localStore.save(features);

    features.watchForChanges(true);

    // set up sync in pods

    for (let i=0; i<size; i++) {
        TerminalOpsSyncAgent.toString
        const peerGroupAgent = pods[i].getAgent(PeerGroupAgent.agentIdForPeerGroup(peerNetworkId)) as PeerGroupAgent;
        
        //let agent = new TerminalOpsSyncAgent(peerGroupAgent, s.hash(), stores[i], MutableSet.opClasses);
        let agent = new HeaderBasedSyncAgent(peerGroupAgent, features.hash(),  await Resources.create({store: stores[i]}), features.getAcceptedMutationOpClasses());
        let gossip = pods[i].getAgent(StateGossipAgent.agentIdForGossip(peerNetworkId)) as StateGossipAgent;
        gossip.trackAgentState(agent.getAgentId());
        //agent;
        pods[i].registerAgent(agent);
    }


    let permissionsClone: PermissionTest|undefined = undefined;
    
    let i = 0;
    while (i<100 && permissionsClone === undefined) {
        permissionsClone = await remoteStore.load(permissions.hash()) as PermissionTest|undefined;
        await new Promise(r => setTimeout(r, 100));
        i = i + 1;
    }
    
    expect(permissionsClone !== undefined);

    await permissionsClone?.loadAllChanges();

    
    let featuresClone: PermissionedFeatureSet|undefined = undefined;
    
    i = 0;
    while (i<100 && featuresClone === undefined) {
        featuresClone  = await remoteStore.load(features.hash()) as PermissionedFeatureSet|undefined;
        await new Promise(r => setTimeout(r, 100));
        i = i + 1;
    }
    
    (featuresClone as PermissionedFeatureSet).users = permissionsClone;

    expect(featuresClone?.useFeatureIfEnabled('anon-write', 'another-usage-key') === undefined);

    await localStore.save(features);
    
    i = 0;
    while (i < 100 && featuresClone?.useFeatureIfEnabled('anon-write', 'yet-another-usage-key') === undefined) {
        await featuresClone?.loadAllChanges();
        await new Promise(r => setTimeout(r, 100));
        i = i + 1;
    }
    

    expect(featuresClone?.useFeatureIfEnabled('anon-write', 'yet-another-usage-key') !== undefined);

    featuresClone?.enableFeature('anon-read', adminId);

    await localStore.save(featuresClone as PermissionedFeatureSet);

    expect(featuresClone?.isEnabled('anon-read') === true);

    permissions.removeAdmin(adminId);
    await localStore.save(permissions);

    i = 0;
    while (i < 100 && featuresClone?.isEnabled('anon-read')) {
        await featuresClone.loadAllChanges();
        await new Promise(r => setTimeout(r, 100));
        i = i + 1;
    }
    

    /*let i = 0;

    while (featuresClone.isEnabled('anon-read') && i < 100) {
        await new Promise(r => setTimeout(r, 100));
    }*/

    expect(featuresClone?.isEnabled('anon-read') === false);
    expect(featuresClone?.isEnabled('anon-write' ));




    for (const pod of pods) {
        pod.shutdown();
    }
}

export { testBasicUndoCycle, testBasicUndoCycleWithSync };