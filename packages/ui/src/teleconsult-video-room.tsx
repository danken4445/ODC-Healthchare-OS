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
  remoteParticipantName?: string;
  appointmentTime?: string;
  serviceName?: string;
  onLeave?: () => void;
  initialLayout?: "pip" | "split";
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
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    // Some mobile browsers do not begin rendering a remote stream until play()
    // is requested after assigning srcObject, even with autoPlay and playsInline.
    void video.play().catch(() => {
      // The browser will retry autoplay after the next user interaction.
    });
  }, [stream]);
  return <video autoPlay className="odyssey-teleconsult-video__stream" muted={muted} playsInline ref={videoRef} />;
}

export function TeleconsultWebRtcRoom({
  client,
  displayLabel,
  roomName,
  remoteParticipantName,
  appointmentTime,
  serviceName,
  onLeave,
  initialLayout = "pip",
}: TeleconsultWebRtcRoomProps) {
  const [callState, setCallState] = useState<CallState>("preparing");
  const [localAudioActive, setLocalAudioActive] = useState(true);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [localVideoActive, setLocalVideoActive] = useState(true);
  const [message, setMessage] = useState("Preparing your camera and microphone…");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [layoutMode, setLayoutMode] = useState<"pip" | "split">(initialLayout);
  const [swappedViews, setSwappedViews] = useState(false);
  const [isPipMinimized, setIsPipMinimized] = useState(false);
  const [facingMode, setFacingMode] = useState<"user" | "environment">("user");
  const [durationSeconds, setDurationSeconds] = useState(0);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const participantIdRef = useRef("");
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const joiningRef = useRef(false);

  // In-call duration timer
  useEffect(() => {
    if (callState !== "connected") {
      setDurationSeconds(0);
      return;
    }
    const interval = setInterval(() => {
      setDurationSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [callState]);

  function formatDuration(totalSeconds: number): string {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  }

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

  async function startOffer(peerId: string) {
    if (peerConnectionRef.current) return;
    const connection = createPeer(peerId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    send("offer", {
      description: offer,
      senderId: participantIdRef.current,
      targetId: peerId,
    });
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
        setMessage("Connected. Encrypted media is streaming directly between you and your clinician.");
      }
      if (["closed", "disconnected", "failed"].includes(connection.connectionState)) {
        setRemoteStream(null);
        if (connection.connectionState === "failed") {
          setCallState("error");
          setMessage("Connection interrupted. Tap Reconnect to rejoin.");
        }
      }
    };
    return connection;
  }

  async function handleOffer(value: unknown) {
    const signal = asSignalPayload(value);
    if (!signal?.targetId || signal.targetId !== participantIdRef.current || !signal.description)
      return;
    // A deterministic participant-id tie-breaker prevents simultaneous offers
    // from replacing each other when both people tap Join together.
    const connection = peerConnectionRef.current ?? createPeer(signal.senderId);
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

  async function handleJoin(value: unknown) {
    const signal = asSignalPayload(value);
    if (
      !signal ||
      signal.senderId === participantIdRef.current ||
      (signal.targetId && signal.targetId !== participantIdRef.current)
    ) {
      return;
    }

    // A direct acknowledgement lets a clinician who joins after a patient
    // discover that waiting participant; Broadcast has no retained history.
    if (!signal.targetId) {
      send("join", {
        senderId: participantIdRef.current,
        targetId: signal.senderId,
      });
    }

    // Both participants now see the same pair of ids. Only one makes the
    // offer, avoiding WebRTC glare while supporting either join order.
    if (participantIdRef.current < signal.senderId) {
      await startOffer(signal.senderId);
    }
  }

  useEffect(() => {
    let cancelled = false;
    async function prepareMedia() {
      if (!window.isSecureContext) {
        setCallState("error");
        setMessage("Camera access requires HTTPS. Open this consultation using a secure https:// address, not an HTTP network address.");
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCallState("error");
        setMessage("This browser does not support secure camera access. Open the consultation in a current browser over HTTPS.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
          video: { facingMode: "user" },
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
        setCallState("ready");
        setMessage("Camera and microphone verified. Ready to enter room.");
      } catch (error) {
        if (!cancelled) {
          setCallState("error");
          const permissionError = error instanceof DOMException && error.name === "NotAllowedError";
          setMessage(
            permissionError
              ? "Camera or microphone access was blocked. Allow access in your browser settings, then reload."
              : "We could not start your camera or microphone. Check that no other app is using them, then reload.",
          );
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
    if (!localStreamRef.current || joiningRef.current || callState === "connected") return;
    const { data } = await client.auth.getSession();
    if (!data.session?.access_token) {
      setCallState("error");
      setMessage("Your sign-in session expired. Sign in again to join this call.");
      return;
    }
    participantIdRef.current ||= createParticipantId();
    client.realtime.setAuth(data.session.access_token);
    joiningRef.current = true;
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    closePeer();
    setCallState("connecting");
    setMessage("Connecting to secure room…");
    const channel = client
      .channel(`teleconsult:${roomName}`, {
        config: { broadcast: { self: false }, private: true },
      })
      .on("broadcast", { event: "join" }, ({ payload }) => {
        void handleJoin(payload).catch(() => {
          setCallState("error");
          setMessage("Unable to negotiate video stream. Tap retry.");
        });
      })
      .on("broadcast", { event: "offer" }, ({ payload }) => {
        void handleOffer(payload).catch(() => {
          setCallState("error");
          setMessage("Unable to accept video stream. Tap retry.");
        });
      })
      .on("broadcast", { event: "answer" }, ({ payload }) => {
        void handleAnswer(payload).catch(() => {
          setCallState("error");
          setMessage("Unable to complete video handshake. Tap retry.");
        });
      })
      .on("broadcast", { event: "ice-candidate" }, ({ payload }) => {
        void handleCandidate(payload).catch(() => {
          setCallState("error");
          setMessage("Unable to exchange media connection. Tap retry.");
        });
      })
      .on("broadcast", { event: "leave" }, ({ payload }) => {
        const signal = asSignalPayload(payload);
        if (signal?.senderId !== participantIdRef.current) {
          closePeer();
          setCallState("ready");
          setMessage("The clinician left the room. You may remain or leave.");
        }
      });
    channelRef.current = channel;
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        joiningRef.current = false;
        send("join", { senderId: participantIdRef.current });
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        joiningRef.current = false;
        channelRef.current?.unsubscribe();
        channelRef.current = null;
        setCallState("error");
        setMessage("Private teleconsultation access was denied or timed out. Reload and try again.");
      }
    });
  }

  function leaveCall() {
    send("leave", { senderId: participantIdRef.current });
    channelRef.current?.unsubscribe();
    channelRef.current = null;
    joiningRef.current = false;
    closePeer();
    setCallState("ready");
    setMessage("You left the consultation. You can rejoin while the room is open.");
    if (onLeave) onLeave();
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

  async function flipCamera() {
    if (!navigator.mediaDevices?.getUserMedia || !localStreamRef.current) return;
    const nextMode = facingMode === "user" ? "environment" : "user";
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: nextMode } },
      });
      const newVideoTrack = stream.getVideoTracks()[0];
      if (newVideoTrack) {
        const oldVideoTrack = localStreamRef.current.getVideoTracks()[0];
        if (oldVideoTrack) {
          localStreamRef.current.removeTrack(oldVideoTrack);
          oldVideoTrack.stop();
        }
        localStreamRef.current.addTrack(newVideoTrack);
        setLocalStream(new MediaStream(localStreamRef.current.getTracks()));
        setFacingMode(nextMode);

        if (peerConnectionRef.current) {
          const sender = peerConnectionRef.current
            .getSenders()
            .find((s) => s.track?.kind === "video");
          if (sender) {
            await sender.replaceTrack(newVideoTrack);
          }
        }
      }
    } catch {
      // Fallback if ideal facing mode fails
    }
  }

  const isCallActive = callState === "connected" || callState === "connecting";
  const otherLabel = remoteParticipantName || (displayLabel === "Clinician" ? "Patient" : "Clinician");

  // Determine stage and PiP streams based on swap toggle
  const stageStream = swappedViews ? localStream : remoteStream;
  const stageVideoActive = swappedViews ? localVideoActive : Boolean(remoteStream);
  const stageMuted = swappedViews;
  const stageLabel = swappedViews ? "You" : otherLabel;

  const pipStream = swappedViews ? remoteStream : localStream;
  const pipVideoActive = swappedViews ? Boolean(remoteStream) : localVideoActive;
  const pipMuted = !swappedViews;
  const pipLabel = swappedViews ? otherLabel : "You";

  return (
    <section
      aria-label="Mobile Teleconsultation Room"
      className={`odyssey-teleconsult-video odyssey-teleconsult-video--${layoutMode} ${isCallActive ? "is-active" : "is-idle"}`}
    >
      {/* Top Glassmorphic Call Header Bar */}
      <div className="odyssey-teleconsult-video__header">
        <div className="odyssey-teleconsult-video__header-info">
          <div className="odyssey-teleconsult-video__status-pill">
            <span
              className={`odyssey-teleconsult-video__status-dot ${
                callState === "connected"
                  ? "is-connected"
                  : callState === "connecting"
                  ? "is-connecting"
                  : "is-idle"
              }`}
            />
            <span className="odyssey-teleconsult-video__status-text">
              {callState === "connected" ? (
                <>Live · {formatDuration(durationSeconds)}</>
              ) : callState === "connecting" ? (
                "Connecting…"
              ) : (
                "Encrypted Room"
              )}
            </span>
          </div>

          <div className="odyssey-teleconsult-video__title-text">
            <strong>{serviceName ?? "Virtual Care Encounter"}</strong>
            {appointmentTime && <small>{appointmentTime}</small>}
          </div>
        </div>

        <div className="odyssey-teleconsult-video__header-actions">
          {isCallActive && (
            <button
              type="button"
              className="odyssey-teleconsult-video__btn-mode"
              onClick={() => setLayoutMode(layoutMode === "pip" ? "split" : "pip")}
              title={layoutMode === "pip" ? "Switch to Split View" : "Switch to Picture-in-Picture"}
              aria-label="Toggle layout mode"
            >
              {layoutMode === "pip" ? "🔲 Split" : "📱 PiP"}
            </button>
          )}
          <span className="odyssey-teleconsult-video__role-badge">{displayLabel}</span>
        </div>
      </div>

      {/* Main Video View Area */}
      <div className="odyssey-teleconsult-video__viewport">
        {/* Pre-Join Lobby View */}
        {!isCallActive && (
          <div className="odyssey-teleconsult-video__lobby">
            <div className="odyssey-teleconsult-video__lobby-preview">
              {localStream && localVideoActive ? (
                <VideoStream muted stream={localStream} />
              ) : (
                <div className="odyssey-teleconsult-video__avatar-placeholder">
                  <div className="odyssey-teleconsult-video__avatar-circle">
                    {displayLabel === "Patient" ? "👤" : "🩺"}
                  </div>
                  <p>{localStream ? "Camera is off" : "Awaiting camera preview"}</p>
                </div>
              )}
              <span className="odyssey-teleconsult-video__lobby-label">Your camera check</span>
            </div>

            <div className="odyssey-teleconsult-video__lobby-details">
              <h3>Ready for your virtual consultation?</h3>
              <p role="status" className="odyssey-teleconsult-video__lobby-msg">{message}</p>

              <div className="odyssey-teleconsult-video__lobby-controls">
                <button
                  type="button"
                  onClick={toggleAudio}
                  disabled={!localStream}
                  className={`odyssey-touch-btn ${localAudioActive ? "active" : "muted"}`}
                  aria-label={localAudioActive ? "Mute mic" : "Unmute mic"}
                >
                  <span>{localAudioActive ? "🎤 Mic On" : "🔇 Mic Off"}</span>
                </button>

                <button
                  type="button"
                  onClick={toggleVideo}
                  disabled={!localStream}
                  className={`odyssey-touch-btn ${localVideoActive ? "active" : "muted"}`}
                  aria-label={localVideoActive ? "Camera off" : "Camera on"}
                >
                  <span>{localVideoActive ? "📹 Video On" : "🚫 Video Off"}</span>
                </button>

                <button
                  type="button"
                  onClick={flipCamera}
                  disabled={!localStream || !localVideoActive}
                  className="odyssey-touch-btn"
                  title="Flip front/back camera"
                  aria-label="Flip camera"
                >
                  <span>🔄 Flip Cam</span>
                </button>
              </div>

              <div className="odyssey-teleconsult-video__lobby-cta">
                <button
                  type="button"
                  disabled={callState !== "ready" && callState !== "error"}
                  onClick={() => void joinCall()}
                  className="odyssey-btn-join-teleconsult"
                >
                  <span>{callState === "error" ? "↻ Reconnect to Consultation" : "🟢 Enter Consultation Room"}</span>
                </button>
                <small className="odyssey-teleconsult-video__security-hint">
                  🔒 Direct WebRTC Peer-to-Peer Encryption
                </small>
              </div>
            </div>
          </div>
        )}

        {/* Active Call PiP Layout */}
        {isCallActive && layoutMode === "pip" && (
          <div className="odyssey-teleconsult-video__pip-container">
            {/* Primary Background Stage */}
            <div className="odyssey-teleconsult-video__stage">
              {stageStream && stageVideoActive ? (
                <VideoStream muted={stageMuted} stream={stageStream} />
              ) : (
                <div className="odyssey-teleconsult-video__waiting-overlay">
                  <div className="odyssey-teleconsult-video__pulse-radar">
                    <span className="radar-circle circle-1" />
                    <span className="radar-circle circle-2" />
                    <div className="radar-avatar">
                      {stageLabel === "Clinician" || stageLabel.includes("Dr") ? "👨‍⚕️" : "👤"}
                    </div>
                  </div>
                  <h4>Waiting for {stageLabel} to connect…</h4>
                  <p>Your audio and video are live and ready. The room is open.</p>
                </div>
              )}
              <div className="odyssey-teleconsult-video__stage-tag">
                <span>{stageLabel}</span>
              </div>
            </div>

            {/* Floating Picture-in-Picture (PiP) Window */}
            {!isPipMinimized && (
              <div
                className="odyssey-teleconsult-video__pip-window"
                onClick={() => setSwappedViews(!swappedViews)}
                title="Tap to switch dominant view"
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    setSwappedViews(!swappedViews);
                  }
                }}
              >
                {pipStream && pipVideoActive ? (
                  <VideoStream muted={pipMuted} stream={pipStream} />
                ) : (
                  <div className="odyssey-teleconsult-video__pip-blank">
                    <span>{pipVideoActive ? "Connecting…" : "Camera Off"}</span>
                  </div>
                )}
                <div className="odyssey-teleconsult-video__pip-bar">
                  <span className="odyssey-teleconsult-video__pip-tag">{pipLabel}</span>
                  <button
                    type="button"
                    className="odyssey-teleconsult-video__pip-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsPipMinimized(true);
                    }}
                    title="Minimize self view"
                    aria-label="Minimize self view"
                  >
                    ✕
                  </button>
                </div>
              </div>
            )}

            {isPipMinimized && (
              <button
                type="button"
                className="odyssey-teleconsult-video__pip-reopen"
                onClick={() => setIsPipMinimized(false)}
                aria-label="Re-open PiP thumbnail"
              >
                📹 Show Self
              </button>
            )}
          </div>
        )}

        {/* Active Call Split Layout (Side-by-side or stacked) */}
        {isCallActive && layoutMode === "split" && (
          <div className="odyssey-teleconsult-video__split-container">
            <div className="odyssey-teleconsult-video__split-tile">
              {remoteStream ? (
                <VideoStream stream={remoteStream} />
              ) : (
                <div className="odyssey-teleconsult-video__waiting-overlay">
                  <h4>Waiting for {otherLabel}…</h4>
                </div>
              )}
              <small>{otherLabel}</small>
            </div>

            <div className="odyssey-teleconsult-video__split-tile">
              {localStream && localVideoActive ? (
                <VideoStream muted stream={localStream} />
              ) : (
                <p>Camera off</p>
              )}
              <small>You</small>
            </div>
          </div>
        )}
      </div>

      {/* Floating Bottom Touch Action Dock */}
      {isCallActive && (
        <div className="odyssey-teleconsult-video__dock">
          {/* Mute Mic */}
          <button
            type="button"
            className={`odyssey-dock-btn ${localAudioActive ? "" : "is-danger-state"}`}
            onClick={toggleAudio}
            title={localAudioActive ? "Mute microphone" : "Unmute microphone"}
            aria-label={localAudioActive ? "Mute microphone" : "Unmute microphone"}
          >
            <span className="odyssey-dock-btn__icon">{localAudioActive ? "🎙️" : "🔇"}</span>
            <span className="odyssey-dock-btn__label">{localAudioActive ? "Mute" : "Unmute"}</span>
          </button>

          {/* Turn Camera On/Off */}
          <button
            type="button"
            className={`odyssey-dock-btn ${localVideoActive ? "" : "is-danger-state"}`}
            onClick={toggleVideo}
            title={localVideoActive ? "Turn camera off" : "Turn camera on"}
            aria-label={localVideoActive ? "Turn camera off" : "Turn camera on"}
          >
            <span className="odyssey-dock-btn__icon">{localVideoActive ? "📹" : "🚫"}</span>
            <span className="odyssey-dock-btn__label">{localVideoActive ? "Stop Cam" : "Start Cam"}</span>
          </button>

          {/* Flip Camera */}
          <button
            type="button"
            className="odyssey-dock-btn"
            disabled={!localVideoActive}
            onClick={flipCamera}
            title="Flip Front / Rear Camera"
            aria-label="Flip Front or Rear Camera"
          >
            <span className="odyssey-dock-btn__icon">🔄</span>
            <span className="odyssey-dock-btn__label">Flip Cam</span>
          </button>

          {/* Swap Stage and PiP */}
          {layoutMode === "pip" && (
            <button
              type="button"
              className="odyssey-dock-btn"
              onClick={() => setSwappedViews(!swappedViews)}
              title="Swap main view and preview"
              aria-label="Swap main view and preview"
            >
              <span className="odyssey-dock-btn__icon">🔁</span>
              <span className="odyssey-dock-btn__label">Swap</span>
            </button>
          )}

          {/* Leave Call */}
          <button
            type="button"
            className="odyssey-dock-btn odyssey-dock-btn--leave"
            onClick={leaveCall}
            title="End consultation call"
            aria-label="End consultation call"
          >
            <span className="odyssey-dock-btn__icon">☎️</span>
            <span className="odyssey-dock-btn__label">End Call</span>
          </button>
        </div>
      )}
    </section>
  );
}
