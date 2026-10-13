import { PlayerStatePacket, RemotePlayerProxy } from './NetworkTypes';

/**
 * Modular Network Adapter interface.
 * Easily implements WebSocket, WebRTC (Geckos.io/PeerJS), or dedicated server synchronization.
 */
export abstract class NetworkAdapter {
  protected onUpdateCallbacks: ((packet: PlayerStatePacket) => void)[] = [];

  public onRemotePlayerUpdate(callback: (packet: PlayerStatePacket) => void): void {
    this.onUpdateCallbacks.push(callback);
  }

  public abstract connect(serverUrl?: string): Promise<boolean>;
  public abstract sendLocalState(state: PlayerStatePacket): void;
  public abstract disconnect(): void;
}

/**
 * Local loopback network adapter for single-player prototyping and debugging.
 */
export class LocalMockNetworkAdapter extends NetworkAdapter {
  private isConnected: boolean = false;
  public remotePlayers: Map<string, RemotePlayerProxy> = new Map();

  public async connect(_serverUrl?: string): Promise<boolean> {
    this.isConnected = true;
    console.info('[NetworkAdapter] Running in standalone offline/modular mode. Ready for multiplayer backend binding.');
    return true;
  }

  public sendLocalState(_state: PlayerStatePacket): void {
    // In multiplayer, serializes and broadcasts via binary WebSocket / WebRTC DataChannel
  }

  public disconnect(): void {
    this.isConnected = false;
  }
}
