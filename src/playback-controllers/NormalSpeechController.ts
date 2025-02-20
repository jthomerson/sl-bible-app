import { MatchedMarker, MediaData } from '@/website-data/website-data';
import { PlaybackController, MediaPlaybackStatus } from './playback-controller';
import { Ref, watch } from 'vue';

/**
 * This controller allows the user to control video speed, and will play the audio at 1.0x
 * speed unless it must be sped up to fit within the alloted time of the matching video
 * marker. So, what will generally happen is that the audio will play, and then pause
 * while the video finishes the corresponding marker (catching up), and then the audio
 * will resume at 1.0x. However, if the video marker is shorter than the audio marker, the
 * audio will be played fast enough to end the marker at the same time the video does.
 */
export default class NormalSpeechController implements PlaybackController {

  private _videoEl: HTMLVideoElement;
  private _audioEl: HTMLAudioElement;
  private _status: MediaPlaybackStatus;
  private _playerData: Ref<MediaData | undefined>;
  private _rateAdjustmentPaused: boolean = false;

  public constructor(videoEl: HTMLVideoElement, audioEl: HTMLAudioElement, status: MediaPlaybackStatus, playerData: Ref<MediaData | undefined>) {
    this._videoEl = videoEl;
    this._audioEl = audioEl;
    this._status = status;
    this._playerData = playerData;
    this._registerListeners();
  }

  private _registerListeners(): void {
    const self = this;

    self._audioEl.addEventListener('timeupdate', () => {
      self._status.audioTime = self._audioEl.currentTime;
    });
    self._videoEl.addEventListener('timeupdate', () => {
      self._status.videoTime = self._videoEl.currentTime;

      if (!self._playerData.value?.markers) {
        return;
      }

      const marker = self._playerData.value.markers.find((m) => {
        return self._videoEl.currentTime >= m.signed.start && self._videoEl.currentTime < m.signed.end;
      });

      if (marker !== self._status.currentMarker) {
        if (!marker) {
          return;
        }

        self._status.currentMarker = marker;
        self._updateAudioPlaybackRate();
      }
    });

    self._videoEl.addEventListener('play', () => {
      self._status.playing = true;
    });
    self._audioEl.addEventListener('play', () => {
      self._status.playing = true;
      self._videoEl.play();
    });

    self._videoEl.addEventListener('pause', () => {
      self._status.playing = false;
    });
    self._audioEl.addEventListener('pause', () => {
      self._status.playing = false;
      self._videoEl.pause();
    });
  }

  jumpToMarker(mrkr: MatchedMarker): void {
    console.debug(`jumpToMarker("${mrkr.id}": ${mrkr.label}) -- ${JSON.stringify(this._status)}`);
    this._rateAdjustmentPaused = true;
    this._status.currentMarker = mrkr;
    this._videoEl.currentTime = mrkr.signed.start;
    this._audioEl.currentTime = mrkr.spoken.start;
    this._rateAdjustmentPaused = false;
    // TODO: probably need to make this adjustment happen at the next time update from the
    // audio player so that we know it actually finished its seek:
    this._updateAudioPlaybackRate();
  }

  incrementPlaybackRate(v: number): void {
    this._videoEl.playbackRate = this._videoEl.playbackRate + v;
    this._status.videoPlaybackRate = this._videoEl.playbackRate;
    this._updateAudioPlaybackRate();
  }

  seekByIncrement(v: number): void {
    const desiredTime = this._videoEl.currentTime + v;

    this._videoEl.currentTime = Math.max(0, Math.min(desiredTime, this._videoEl.duration));
    // Updating the audio playback rate also seeks it to the proper location if it's not
    // close (within one second), so we take advantage of that here.
    // TODO: probably need to make this adjustment happen at the next time update from the
    // audio player so that we know it actually finished its seek:
    this._updateAudioPlaybackRate();
  }

  private _updateAudioPlaybackRate() {
    if (this._rateAdjustmentPaused || !this._status.currentMarker) {
      return;
    }

    const $vid = this._videoEl,
      $aud = this._audioEl,
      mrkr = this._status.currentMarker,
      vidPast = $vid.currentTime - mrkr.signed.start,
      vidDuration = mrkr.signed.end - mrkr.signed.start,
      vidPastPctg = vidPast / vidDuration,
      audPast = $aud.currentTime - mrkr.spoken.start,
      audDuration = mrkr.spoken.end - mrkr.spoken.start,
      audPastPctg = audPast / audDuration,
      audExpectedTime = (audDuration * vidPastPctg) + mrkr.spoken.start,
      // see if the audio is within one second (on either side)
      // of where this audio marker should start
      isAudioClose = ($aud.currentTime >= (audExpectedTime - 1)) && ($aud.currentTime <= (audExpectedTime + 1));

    console.debug(`vid at ${$vid.currentTime.toFixed(2)} of ${mrkr.signed.start.toFixed(2)}-${mrkr.signed.end.toFixed(2)} (${(vidPastPctg * 100).toFixed(2)}% of ${vidDuration.toFixed(2)} sec); aud at ${$aud.currentTime.toFixed(2)} (expected ${audExpectedTime.toFixed(2)}) of ${mrkr.spoken.start.toFixed(2)}-${mrkr.spoken.end.toFixed(2)} (${(audPastPctg * 100).toFixed(2)}% of ${audDuration.toFixed(2)} sec)`);

    if (!isAudioClose) {
      console.info(`audio was not close: at ${$aud.currentTime}, expected ${audExpectedTime}, so seeking`);
      $aud.currentTime = audExpectedTime;
    }

    const vidRemaining = mrkr.signed.end - $vid.currentTime,
      audRemaining = mrkr.spoken.end - $aud.currentTime,
      playbackRate = (audRemaining / vidRemaining) * $vid.playbackRate;

    if (playbackRate !== Infinity) {
      console.debug(`Updating audio playback rate to ${playbackRate}`);
      $aud.playbackRate = playbackRate;
      this._status.audioPlaybackRate = playbackRate;
    }
  }
}
