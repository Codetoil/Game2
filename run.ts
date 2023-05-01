import BABYLON from 'babylonjs@4.2.0';
import Peer from 'peerjs-esm@1.3.1';

interface Packet {
    type: PacketType;
}

class PacketType {
    readonly name: String;
    readonly encode: (packet: Packet) => Object;
    readonly decode: (data: Object) => Packet;

    public constructor(
        name: String,
        encode: (packet: Packet) => Object,
        decode: (data: Object) => Packet
    ) {
        this.name = name;
        this.encode = encode;
        this.decode = decode;
    }
}

class PacketTypeList {
    private packetTypes: Map<String, PacketType> = new Map<String, PacketType>();
    public getPacketType(name: String): PacketType {
        return this.packetTypes.get(name);
    }
    public addPacketType(packetType: PacketType): PacketTypeList {
        this.packetTypes.set(packetType.name, packetType);
        return this;
    }
    public hasPacketType(name: String): boolean {
        return this.packetTypes.has(name);
    }
    public encode(packet: Packet): Object {
        return packet.type.encode(packet);
    }
    public decode(data: Object): Packet {
        if (!this.isValidPacket(data))
            throw new Error('Data recieved is not a valid packet' + data);
        return this.getPacketType(data['id']).decode(data);
    }
    public isValidPacket(data: Object): boolean {
        return (
            data.hasOwnProperty('id') &&
            data.hasOwnProperty('data') &&
            this.hasPacketType(data['id'])
        );
    }
}

class PacketTypes {
    public static ELEMENT: PacketType = new PacketType(
        'packet_element',
        packet => {
            try {
                packet as ElementPacket;
            } catch (e) {
                throw new Error(
                    'Using wrong packet decoder. Given: packet_element, Needed: ' +
                    packet.type
                );
            }
            return {
                id: 'packet_element',
                data: {
                    internalId: (packet as ElementPacket).internalId,
                },
            };
        },
        data => {
            if (!data['data'].hasOwnProperty('internalId'))
                throw new Error('Data recieved is not a valid packet' + data);
            let packet = new ElementPacket(data['data']['internalId']);
            return packet;
        }
    );

    public static init(packetTypeList: PacketTypeList): void {
        packetTypeList.addPacketType(PacketTypes.ELEMENT);
    }
}

class ElementPacket implements Packet {
    private id$: String;

    constructor(internalId: String) {
        this.id$ = internalId;
    }

    public get type(): PacketType {
        return PacketTypes.ELEMENT;
    }

    public get internalId(): String {
        return this.id$;
    }

    public asString(): String {
        return 'ElementPacket ' + this.internalId;
    }
}

interface GameServer {
    applyPacket(packet: Packet): void;
    packetTypeList: PacketTypeList;
    init(): void;
}

class Peer2PeerConnection {
    private conn$: Peer.DataConnection;
    private gamePeer: Peer2PeerGameServer;

    private static onOpen(gConn: Peer2PeerConnection) {
        console.log('connection open');
    }

    private static onData(gConn: Peer2PeerConnection, data: any) {
        console.log('connection data', data);
        if (gConn.gamePeer.packetTypeList.isValidPacket(data)) {
            gConn.gamePeer.applyPacket(gConn.gamePeer.packetTypeList.decode(data));
        } else {
            console.warn('unknown data recieved:', data);
        }
    }

    private static onClose(gConn: Peer2PeerConnection) {
        console.log('connection close');
        gConn.gamePeer.closeConnection(gConn);
    }

    private static onError(gConn: Peer2PeerConnection, err: Error) {
        console.error('connection error', err);
    }

    public set conn(conn: Peer.DataConnection) {
        this.conn$ = conn;
        this.conn$.on('open', Peer2PeerConnection.onOpen.bind(this, this));
        this.conn$.on('data', Peer2PeerConnection.onData.bind(this, this));
        this.conn$.on('close', Peer2PeerConnection.onClose.bind(this, this));
        this.conn$.on('error', Peer2PeerConnection.onError.bind(this, this));
    }

    public get conn(): Peer.DataConnection {
        return this.conn$;
    }

    public constructor(gamePeer: Peer2PeerGameServer, conn: Peer.DataConnection) {
        this.gamePeer = gamePeer;
        this.conn = conn;
    }
}

class Peer2PeerGameServer implements GameServer {
    private peer$: Peer;
    private peerId: String;
    private gameConnection: Peer2PeerConnection = null;
    private packetTypeList$: PacketTypeList = new PacketTypeList();

    private static onOpen(gPeer: Peer2PeerGameServer, peerId: String) {
        gPeer.peerId = peerId;
        console.log('peer open', peerId);
    }

    private static onConnection(
        gPeer: Peer2PeerGameServer,
        conn: Peer.DataConnection
    ) {
        if (gPeer.gameConnection === null) {
            gPeer.gameConnection = new Peer2PeerConnection(gPeer, conn);
            console.log('peer connection', conn.peer);
        }
    }

    private static onCall(
        gPeer: Peer2PeerGameServer,
        mediaConnection: Peer.MediaConnection
    ) {
        console.log('peer call');
    }

    private static onClose(gPeer: Peer2PeerGameServer) {
        console.log('peer close');
    }

    private static onDisconnected(gPeer: Peer2PeerGameServer) {
        console.log('peer disconnected');
        setTimeout(() => {
            gPeer.peer = new Peer(gPeer.peerId);
        }, 3000);
    }

    private static onError(gPeer: Peer2PeerGameServer, err: Error) {
        console.error('peer error', err);
    }

    public closeConnection(conn: Peer2PeerConnection) {
        this.gameConnection = null;
        console.log('peer remove connection');
    }

    public applyPacket(packet: Packet) {
        if (typeof packet['asString'] === 'function') {
            console.log(packet['asString']());
        } else {
            console.log(packet);
        }
    }

    public set peer(peer: Peer) {
        this.peer$ = peer;
        this.peer$.on('open', Peer2PeerGameServer.onOpen.bind(this, this));
        this.peer$.on(
            'connection',
            Peer2PeerGameServer.onConnection.bind(this, this)
        );
        this.peer$.on('call', Peer2PeerGameServer.onCall.bind(this, this));
        this.peer$.on('close', Peer2PeerGameServer.onClose.bind(this, this));
        this.peer$.on(
            'disconnected',
            Peer2PeerGameServer.onDisconnected.bind(this, this)
        );
        this.peer$.on('error', Peer2PeerGameServer.onError.bind(this, this));
    }

    public get peer(): Peer {
        return this.peer$;
    }

    public get packetTypeList(): PacketTypeList {
        return this.packetTypeList$;
    }

    public constructor(peerId?: String) {
        this.peer = new Peer(peerId);
    }

    public init(): void {
        PacketTypes.init(this.packetTypeList);
    }
}

/**
 * Something that can be `Tattled` or `Spyed`.
 */
interface Describable {
    /** Each [Character] [Describes] a [Describable] differently.
     * This is a map from the character who said it to the description.  */
}

/**
 * Describes the visuals of something.
 */
interface RegistryElement {
    readonly internalId: String;
}

interface VisualElement extends RegistryElement {
}

interface DescriptorElement extends RegistryElement {
}

/**
 * Determines the result a paticular move will give asyncronously.
 * Does not affects the characters.
 */
interface MoveResultPicker {
    run: Promise<MoveResult>;
}

/**
 * A potential result of a given move.
 * Does not preform any action.
 */
class MoveResult implements RegistryElement {
    readonly internalId: String;
    readonly move: Move;

    constructor(internalId: String, move: Move) {
        this.internalId = internalId;
        this.move = move;
    }
}

/**
 * Applies the result of a move to the scene.
 * e.g. Reducing HP.
 */
class MoveSceneApplier implements RegistryElement {
    readonly internalId: String;
    readonly apply: (internalResult: MoveResult) => void;

    constructor(internalId: String, apply: (internalResult: MoveResult) => void) {
        this.internalId = internalId;
        this.apply = apply;
    }
}

/**
 * Describes the visuals of an action command.
 */
class ActionCommand implements VisualElement, Describable {
    readonly internalId: String;

    constructor(internalId: String) {
        this.internalId = internalId;
    }
}

/**
 * Describes the visuals of a character.
 */
class Character implements VisualElement, Describable {
    readonly internalId: String;
    /**
     * An array of the moves the player posseses.
     */
    readonly moves: Array<Move>;

    constructor(internalId: String, moves: Array<Move>) {
        this.internalId = internalId;
        this.moves = moves;
    }
}

/**
 * Describes the visuals of a badge.
 */
class Badge implements VisualElement, Describable {
    readonly internalId: String;

    constructor(internalId: String) {
        this.internalId = internalId;
    }
}

/**
 * Describes the visuals of a move.
 */
class Move implements VisualElement, Describable {
    readonly internalId: String;

    constructor(internalId: String) {
        this.internalId = internalId;
    }
}

/**
 * Describes the visuals of a player.
 */
class CharacterSetup implements VisualElement {
    readonly internalId: String;
    /**
     * true if the badge is active, false otherwise.
     */
    readonly badges: Map<Badge, boolean>;

    constructor(internalId: String, badges: Map<Badge, boolean>) {
        this.internalId = internalId;
        this.badges = badges;
    }
}

class Battle implements VisualElement {
    readonly internalId: String;

    constructor(internalId: String) {
        this.internalId = internalId;
    }
}

/**
 * Describes the mechanics of an action command.
 */
class ActionCommandDescriptor implements DescriptorElement, MoveResultPicker {
    readonly internalId: String;
    readonly run: Promise<MoveResult>;

    constructor(internalId: String, run: Promise<MoveResult>) {
        this.internalId = internalId;
        this.run = run;
    }
}

/**
 * Describes the mechanics about a character.
 */
class CharacterDescriptor implements DescriptorElement {
    readonly internalId: String;
    /**
     * Maximum amount of HP the player has.
     */
    readonly maxHP: number;
    /**
     * An array of the moves the player posseses.
     */
    readonly moves: Array<MoveDescriptor>;

    constructor(internalId: String, maxHP: number, moves: Array<MoveDescriptor>) {
        this.internalId = internalId;
        this.maxHP = maxHP;
        this.moves = moves;
    }
}

/**
 * Describes the mechanics of a badge.
 */
class BadgeDescriptor implements DescriptorElement {
    readonly internalId: String;
    readonly badgeCost: number;

    constructor(internalId: String, badgeCost: number) {
        this.internalId = internalId;
        this.badgeCost = badgeCost;
    }
}

/**
 * Describes the mechanics of a move.
 */
class MoveDescriptor implements DescriptorElement {
    readonly internalId: String;
    readonly moveCost: number;
    readonly movePicker: MoveResultPicker;
    readonly damage: MoveSceneApplier;

    constructor(
        internalId: String,
        moveCost: number,
        movePicker: MoveResultPicker,
        damage: MoveSceneApplier
    ) {
        this.internalId = internalId;
        this.moveCost = moveCost;
        this.movePicker = movePicker;
        this.damage = damage;
    }
}

/**
 * Describes the mechanics of a player.
 */
class CharacterSetupDescriptor implements DescriptorElement {
    readonly internalId: String;
    /**
     * Maximum amount of TP the player has.
     */
    readonly maxTP: number;
    /**
     * Maximum amount of BP the player has.
     */
    readonly maxBP: number;
    /**
     * true if the badge is active, false otherwise.
     */
    readonly badges: Map<BadgeDescriptor, boolean>;

    constructor(
        internalId: String,
        maxTP: number,
        maxBP: number,
        badges: Map<BadgeDescriptor, boolean>
    ) {
        this.internalId = internalId;
        this.maxTP = maxTP;
        this.maxBP = maxBP;
        this.badges = badges;
    }
}

class BattleDescriptor implements DescriptorElement {
    readonly internalId: String;

    constructor(internalId: String) {
        this.internalId = internalId;
    }
}

var BATTLE1 = new Battle('battle_1');
var JUMP = new Move('move_jump');
var GOOMBARIO = new Character('character_goombario', []);
var MARIO = new Character('character_mario', [JUMP]);
var PM64 = new CharacterSetup('character_setup_pm64', new Map([]));

var BATTLE1_DESCRIPTOR = new BattleDescriptor('battle_descriptor_1')
var JUMP_FAIL = new MoveResult('move_result_jump_fail_action_command', JUMP);
var JUMP_SUCCESS = new MoveResult('move_result_jump_succeed_action_command', JUMP);
var JUMP_ACTION_COMMAND = new ActionCommand('action_command_jump');
var JUMP_ACTION_COMMAND_DESCRIPTOR = new ActionCommandDescriptor(
    'action_command_descriptor_jump',
    new Promise((resolve, _reject) => {
        resolve(JUMP_FAIL);
    })
);
var JUMP_SCENE_APPLIER = new MoveSceneApplier(
    'move_scene_applier_jump',
    (internalResult: MoveResult) => {
        switch (internalResult.internalId) {
            case 'move_result_jump_fail_action_command':
                break;
            case 'move_result_jump_success_action_command':
                break;
            default:
                break;
        }
    }
);
var JUMP_DESCRIPTOR = new MoveDescriptor(
    'move_descriptor_jump',
    0,
    JUMP_ACTION_COMMAND_DESCRIPTOR,
    JUMP_SCENE_APPLIER
);
var GOOMBARIO_DESCRIPTOR = new CharacterDescriptor("character_descriptor_goombario", 0, []);
var MARIO_DESCRIPTOR = new CharacterDescriptor("character_descriptor_mario", 10, [JUMP_DESCRIPTOR]);
var PM64_DESCRIPTOR = new CharacterSetupDescriptor("character_setup_descriptor_pm64", 5, 3, new Map([]))

const createScene = function () {
    const scene = new BABYLON.Scene(engine);

    const camera = new BABYLON.FollowCamera(
        'camera',
        new BABYLON.Vector3(0, 1, 10),
        scene
    );
    // The goal distance of camera from target
    camera.radius = 10;

    // The goal height of camera above local origin (centre) of target
    camera.heightOffset = 1;

    // The goal rotation of camera around local origin (centre) of target in x y plane
    camera.rotationOffset = 0;

    // Acceleration of camera in moving from current to goal position
    camera.cameraAcceleration = 0.005;

    // The speed at which acceleration is halted
    camera.maxCameraSpeed = 10;

    // This attaches the camera to the canvas
    //camera.attachControl(canvas, true);

    const light = new BABYLON.HemisphericLight(
        'light',
        new BABYLON.Vector3(0, 1, 0),
        scene
    );
    const box = BABYLON.MeshBuilder.CreateBox('box', {}, scene);
    camera.lockedTarget = box;
    box.position = new BABYLON.Vector3(0, 0.75, 0);
    box.isVisible = false;
    const ground = BABYLON.MeshBuilder.CreatePlane(
        'ground',
        { width: 10, height: 3, sideOrientation: BABYLON.Mesh.DOUBLESIDE },
        scene
    );
    ground.rotation = new BABYLON.Vector3(Math.PI / 2, 0, 0);

    server = new Peer2PeerGameServer('c89114fc-c0c4-4578-b9ef-7f77ca8d3773');
    server.init();

    return scene;
};

var server: Peer2PeerGameServer;

const canvas = document.getElementById('renderCanvas'); // Get the canvas element
const engine = new BABYLON.Engine(canvas, true); // Generate the BABYLON 3D engine

const scene = createScene(); //Call the createScene function

// Register a render loop to repeatedly render the scene
engine.runRenderLoop(function () {
    scene.render();
});

// Watch for browser/canvas resize events
window.addEventListener('resize', function () {
    engine.resize();
});
