"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@odyssey/types";
import { useEffect, useRef, useState } from "react";

type CallState = "preparing" | "ready" | "connecting" | "connected" | "error";

interface SignalPayload {
  candidate?: RTCIceCandidateInit;
  description?: RTCSessionDescriptionInit;
  senderId: string;
  targetId?: string;
}

export interface TeleconsultWebRtcRoomProps {
  client: SupabaseClient<Database>;
  displayLabel: "Clinician" | "Patient";
  roomName: string;
}

const iceServers: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

function createParticipantId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto)
    return crypto.randomUUID();
  return `participant-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function asSignalPayload(value: unknown): SignalPayload | null {
  if (!value || typeof value !== "object") return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.senderId !== "string") return null;
  return {
    senderId: payload.senderId,
    ...(typeof payload.targetId === "string" ? { targetId: payload.targetId } : {}),
    ...(payload.candidate && typeof payload.candidate === "object"
      ? { candidate: payload.candidate as RTCIceCandidateInit }
      : {}),
    ...(payload.description && typeof payload.description === "object"
      ? { description: payload.description as RTCSessionDescriptionInit }
      : {}),
  };
}

function VideoStream({ muted = false, stream }: { muted?: boolean; stream: MediaStream }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return <video autoPlay className="odyssey-teleconsult-video__stream" muted={muted} playsInline ref={videoRef} />;
}

/**
 * DrAbi-style peer-to-peer WebRTC. Supabase Realtime Broadcast exchanges only
 * SDP/ICE signals; camera and microphone media flows directly between the two
 * appointment participants.
 */
export function TeleconsultWebRtcRoom({
  client,
  displayLabel,
  roomName,
}: TeleconsultWebRtcRoomProps) {
  const [callState, setCallState] = useState<CallState>("preparing");
  const [localAudioActive, setLocalAudioActive] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localVideoActive, setLocalVideoActive] = useState(true);
  const [message, setMessage] = useState("Preparing your camera and microphone…");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const participantIdRef = useRef("");
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  function closePeer() {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    pendingCandidatesRef.current = [];
    setRemoteStream(null);
  }

  function send(event: "answer" | "ice-candidate" | "join" | "leave" | "offer", payload: SignalPayload) {
    if (!channelRef.current) return;
    void channelRef.current.send({ type: "broadcast", event, payload });
  }

  function createPeer(peerId: string): RTCPeerConnection {
    closePeer();
    const connection = new RTCPeerConnection(iceServers);
    peerConnectionRef.current = connection;
    localStreamRef.current?.getTracks().forEach((track) =>
      connection.addTrack(track, localStreamRef.current as MediaStream),
    );
    connection.onicecandidate = ({ candidate }) => {
      if (candidate) {
        send("ice-candidate", {
          candidate: candidate.toJSON(),
          senderId: participantIdRef.current,
          targetId: peerId,
        });
      }
    };
    connection.ontrack = ({ streams }) => {
      if (streams[0]) setRemoteStream(streams[0]);
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === "connected") {
        setCallState("connected");
        setMessage("Connected. Your media is sent directly to the other participant.");
      }
      if (["closed", "disconnected", "failed"].includes(connection.connectionState)) {
        setRemoteStream(null);
        if (connection.connectionState === "failed") {
          setCallState("error");
          setMessage("The peer connection failed. Leave and try joining again.");
        }
      }
    };
    return connection;
  }

  async function handleOffer(value: unknown) {
    const signal = asSignalPayload(value);
    if (!signal?.targetId || signal.targetId !== participantIdRef.current || !signal.description)
      return;
    const connection = createPeer(signal.senderId);
    await connection.setRemoteDescription(signal.description);
    for (const candidate of pendingCandidatesRef.current)
      await connection.addIceCandidate(candidate);
    pendingCandidatesRef.current = [];
    const answer = await connection.createAnswer();
    await connection.setLocalDescription(answer);
    send("answer", {
      description: answer,
      senderId: participantIdRef.current,
      targetId: signal.senderId,
    });
  }

  async function handleAnswer(value: unknown) {
    const signal = asSignalPayload(value);
    if (!signal?.targetId || signal.targetId !== participantIdRef.current || !signal.description)
      return;
    const connection = peerConnectionRef.current;
    if (!connection) return;
    await connection.setRemoteDescription(signal.description);
    for (const candidate of pendingCandidatesRef.current)
      await connection.addIceCandidate(candidate);
    pendingCandidatesRef.current = [];
  }

  async function handleCandidate(value: unknown) {
    const signal = asSignalPayload(value);
    if (!signal?.targetId || signal.targetId !== participantIdRef.current || !signal.candidate)
      return;
    const connection = peerConnectionRef.current;
    if (!connection?.remoteDescription) {
      pendingCandidatesRef.current.push(signal.candidate);
      return;
    }
    await connection.addIceCandidate(signal.candidate);
  }

  useEffect(() => {
    let cancelled = false;
    async function prepareMedia() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCallState("ready");
        setMessage("Check your camera and microphone, then join the call.");
      } catch {
        if (!cancelled) {
          setCallState("error");
          setMessage("Camera or microphone access was not granted. Allow access, then reload this page.");
        }
      }
    }
    void prepareMedia();
    return () => {
      cancelled = true;
      channelRef.current?.unsubscribe();
      closePeer();
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
    };
  }, []);

  async function joinCall() {
    if (!localStreamRef.current || callState === "connecting" || callState === "connected") return;
    const { data } = await client.auth.getSession();
    if (!data.session?.access_token) {
      setCallState("error");
      setMessage("Your sign-in session has expired. Sign in again to join this call.");
      return;
    }
    participantIdRef.current ||= createParticipantId();
    client.realtime.setAuth(data.session.access_token);
    setCallState("connecting");
    setMessage("Joining the private teleconsultation channel…");
    const channel = client
      .channel(`teleconsult:${roomName}`, {
        config: { broadcast: { self: false }, private: true },
      })
      .on("broadcast", { event: "join" }, ({ payload }) => {
        const signal = asSignalPayload(payload);
        if (!signal || signal.senderId === participantIdRef.current) return;
        void (async () => {
          const connection = createPeer(signal.senderId);
          const offer = await connection.createOffer();
          await connection.setLocalDescription(offer);
          send("offer", {
            description: offer,
            senderId: participantIdRef.current,
            targetId: signal.senderId,
          });
        })().catch(() => {
          setCallState("error");
          setMessage("Unable to negotiate the video connection. Try joining again.");
        });
      })
      .on("broadcast", { event: "offer" }, ({ payload }) => {
        void handleOffer(payload).catch(() => {
          setCallState("error");
          setMessage("Unable to accept the video connection. Try joining again.");
        });
      })
      .on("broadcast", { event: "answer" }, ({ payload }) => {
        void handleAnswer(payload).catch(() => {
          setCallState("error");
          setMessage("Unable to complete the video connection. Try joining again.");
        });
      })
      .on("broadcast", { event: "ice-candidate" }, ({ payload }) => {
        void handleCandidate(payload).catch(() => {
          setCallState("error");
          setMessage("Unable to exchange connection details. Try joining again.");
        });
      })
      .on("broadcast", { event: "leave" }, ({ payload }) => {
        const signal = asSignalPayload(payload);
        if (signal?.senderId !== participantIdRef.current) {
          closePeer();
          setCallState("ready");
          setMessage("The other participant left the call.");
        }
      });
    channelRef.current = channel;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        send("join", { senderId: participantIdRef.current });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        setCallState("error");
        setMessage("Private teleconsultation access was denied or timed out. Reload and try again.");
      }
    });
  }

  function leaveCall() {
    send("leave", { senderId: participantIdRef.current });
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    closePeer();
    setCallState("ready");
    setMessage("You left the call. You can rejoin while the room remains open.");
  }

  function toggleAudio() {
    const track = localStreamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setLocalAudioActive(track.enabled);
  }

  function toggleVideo() {
    const track = localStreamRef.current?.getVideoTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setLocalVideoActive(track.enabled);
  }

  return (
    <section aria-label="Teleconsultation video" className="odyssey-teleconsult-video">
      <div className="odyssey-teleconsult-video__header">
        <div>
          <strong>Secure video consultation</strong>
          <p role="status">{message}</p>
        </div>
        <span>{displayLabel}</span>
      </div>
      <div className="odyssey-teleconsult-video__streams">
        <div className="odyssey-teleconsult-video__tile">
          {localStream && localVideoActive ? <VideoStream muted stream={localStream} /> : <p>Camera off</p>}
          <small>You</small>
        </div>
        <div className="odyssey-teleconsult-video__tile">
          {remoteStream ? <VideoStream stream={remoteStream} /> : <p>Waiting for the other participant</p>}
          <small>Other participant</small>
        </div>
      </div>
      <div className="odyssey-teleconsult-video__controls">
        <button disabled={!localStream} onClick={toggleAudio} type="button">
          {localAudioActive ? "Mute microphone" : "Unmute microphone"}
        </button>
        <button disabled={!localStream} onClick={toggleVideo} type="button">
          {localVideoActive ? "Turn camera off" : "Turn camera on"}
        </button>
        {callState === "connected" || callState === "connecting" ? (
          <button className="odyssey-teleconsult-video__leave" onClick={leaveCall} type="button">Leave call</button>
        ) : (
          <button disabled={callState !== "ready"} onClick={() => void joinCall()} type="button">Join call</button>
        )}
      </div>
    </section>
  );
}
