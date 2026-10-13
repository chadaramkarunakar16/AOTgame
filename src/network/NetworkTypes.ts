export interface Vector3Packet {
  x: number;
  y: number;
  z: number;
}

export interface HookPacket {
  active: boolean;
  anchor: Vector3Packet | null;
}

export interface PlayerStatePacket {
  playerId: string;
  timestamp: number;
  position: Vector3Packet;
  velocity: Vector3Packet;
  yaw: number;
  pitch: number;
  leftHook: HookPacket;
  rightHook: HookPacket;
  health: number;
  gas: number;
  isBoosting: boolean;
}

export type NetworkEventType = 'connect' | 'disconnect' | 'playerJoined' | 'playerLeft' | 'playerUpdate';

export interface RemotePlayerProxy {
  id: string;
  state: PlayerStatePacket;
}
