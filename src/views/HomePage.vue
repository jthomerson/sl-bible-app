<template>
  <ion-page>
    <ion-header :translucent="true" v-if="!(selectedBook && selectedChapter)">
      <ion-toolbar>
        <ion-title>Bible Watcher</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content :fullscreen="false">
      <div class="contentArea">
        <div class="bookCollection" v-if="hebrewScriptures?.length && !selectedBook">
          <h3>Hebrew Scriptures</h3>
          <div class="books">
            <div class="book" v-for="book in hebrewScriptures" :key="book.num"
              :class="'bk' + book.num"
              @click="selectedBook = book"
              >
              {{ book.abbr }}
            </div>
          </div>
        </div>
        <div class="bookCollection" v-if="greekScriptures?.length && !selectedBook">
          <h3>Greek Scriptures</h3>
          <div class="books">
            <div class="book" v-for="book in greekScriptures" :key="book.num"
              :class="'bk' + book.num"
              @click="selectedBook = book"
              >
              {{ book.abbr }}
            </div>
          </div>
        </div>
        <div class="chapterCollection" v-if="selectedBook && !selectedChapter">
          <h3>
            <button @click="selectedBook = undefined">&lt;</button>
            {{ selectedBook.name }}
          </h3>
          <div class="chapters">
            <div class="chapter" v-for="chap in availableChapters" :key="chap" @click="selectedChapter = chap">
              {{ chap }}
            </div>
          </div>
        </div>
        <div class="mediaPlayer" v-if="selectedBook && selectedChapter">
          <div class="videoPlayer" v-if="playerData">
            <video ref="videoEl"
              playsinline muted controls="false"
              poster="./images/video-placeholder.jpg"
              v-bind:src="playerData.signed.url"
            ></video>
            <audio ref="audioEl"
              controls="false"
              v-bind:src="playerData.spoken.url"
            ></audio>
          </div>
          <div class="mediaPlayerOverlay" ref="mediaPlayerOverlay"
            @click="toggleOverlay()">
            <div class="overlayHeader">
              <h3>
                <button @click.stop="selectedChapter = undefined">&lt;</button>
                {{ selectedBook.name }} {{ selectedChapter }}
              </h3>
            </div>
            <div class="playerControls" v-if="playerData">
              <button @click.stop="changeMarkerByIncrement(-1)">
                Prev
              </button>
              <button @click.stop="seekVideo(-5)">
                -5s
              </button>
              <button @click.stop="playPause()">
                <span v-if="playbackStatus.playing">Pause</span>
                <span v-if="!playbackStatus.playing">Play</span>
              </button>
              <button @click.stop="seekVideo(+15)">
                +15s
              </button>
              <button @click.stop="changeMarkerByIncrement(+1)">
                Next
              </button>
            </div>
            <div class="playerDebug" v-if="playerData">
              <div class="debugInfo">
                Video rate:
                <button @click.stop="updateVideoPlaybackRate(-0.2)">-</button>
                {{ playbackStatus.videoPlaybackRate.toFixed(1) }}
                <button @click.stop="updateVideoPlaybackRate(0.2)">+</button>
                &nbsp;&nbsp;|&nbsp;&nbsp;
                Audio rate: {{ playbackStatus.audioPlaybackRate.toFixed(3) }}
                <br>
                Video: {{ playbackStatus.videoTime.toFixed(3) }}
                &nbsp;&nbsp;|&nbsp;&nbsp;
                Audio: {{ playbackStatus.audioTime.toFixed(3) }}
                <br>
                Current Marker:
                {{ playbackStatus.currentMarker?.label || "None" }}
              </div>
            </div>
            <div class="markerListContainer"
              @click="toggleOverlay()"
              v-if="playerData?.markers.length">
              <ul class="markers">
                <li v-for="mrkr in playerData.markers" :key="mrkr.id"
                  @click.stop="jumpToMarker(mrkr)"
                  :class="playbackStatus.currentMarker?.id === mrkr.id ? 'active' : ''"
                  >
                  {{ mrkr.label }}
              </li>
              </ul>
            </div>
          </div>
        </div>
        <div id="loading" v-if="loading">Loading...</div>
      </div>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { IonContent, IonHeader, IonPage, IonTitle, IonToolbar } from '@ionic/vue';
import WebsiteData, { BibleBook, MatchedMarker, MediaData } from '@/website-data/website-data';
import { Ref, ref, onMounted, watch } from 'vue';

interface MediaPlaybackStatus {
  playing: boolean;
  videoTime: number;
  audioTime: number;
  videoPlaybackRate: number;
  audioPlaybackRate: number;
  currentMarker?: MatchedMarker;
}

function emptyPlaybackStatus(): MediaPlaybackStatus {
  return {
    playing: false,
    videoTime: 0,
    audioTime: 0,
    videoPlaybackRate: 1,
    audioPlaybackRate: 1,
    currentMarker: undefined,
  };
}

const PLAYER_DEBUG_MODE = false;

const data = new WebsiteData(),
      loading = ref(true),
      hebrewScriptures: Ref<BibleBook[] | undefined> = ref(),
      greekScriptures: Ref<BibleBook[] | undefined> = ref(),
      selectedBook: Ref<BibleBook | undefined> = ref(),
      availableChapters: Ref<number[]> = ref([]),
      selectedChapter: Ref<number | undefined> = ref(),
      playerData: Ref<MediaData | undefined> = ref(),
      playbackStatus: Ref<MediaPlaybackStatus> = ref(emptyPlaybackStatus()),
      videoEl = ref<HTMLVideoElement>(),
      audioEl = ref<HTMLAudioElement>(),
      mediaPlayerOverlay = ref<HTMLDivElement>();

let audioPlaybackRateAdjustmentsPaused = false;

function playPause() {
  if (playbackStatus.value.playing) {
    audioEl.value?.pause();
  } else {
    audioEl.value?.play();
  }
}

function changeMarkerByIncrement(inc: number) {
  if (!playerData.value || !playbackStatus.value || !playbackStatus.value.currentMarker) {
    return;
  }

  const currentMarkerInd = playerData.value.markers.indexOf(playbackStatus.value.currentMarker),
        desiredMarkerInd = currentMarkerInd >= 0 ? (currentMarkerInd + inc) : -1;

  if (desiredMarkerInd < 0 || desiredMarkerInd >= playerData.value.markers.length) {
    return;
  }

  return jumpToMarker(playerData.value.markers[desiredMarkerInd]);
}

function seekVideo(v: number) {
  if (!videoEl.value) {
    return;
  }

  const desiredTime = videoEl.value.currentTime + v;

  videoEl.value.currentTime = Math.max(0, Math.min(desiredTime, videoEl.value.duration));
  // Updating the audio playback rate also seeks it to the proper location if it's not
  // close (within one second), so we take advantage of that here.
  // TODO: probably need to make this adjustment happen at the next time update from the
  // audio player so that we know it actually finished its seek:
  updateAudioPlaybackRate();
}

function toggleOverlay() {
  if (!mediaPlayerOverlay.value) {
    throw new Error('no overlay found');
  }

  mediaPlayerOverlay.value.classList.toggle('hidden');
}

function updateVideoPlaybackRate(inc: number) {
  if (!videoEl.value) {
    return;
  }

  videoEl.value.playbackRate = videoEl.value.playbackRate + inc;
  playbackStatus.value.videoPlaybackRate = videoEl.value.playbackRate;
  updateAudioPlaybackRate();
}

function jumpToMarker(mrkr: MatchedMarker): void {
  if (!videoEl.value || !audioEl.value) {
    return;
  }

  audioPlaybackRateAdjustmentsPaused = true;
  playbackStatus.value.currentMarker = mrkr;
  videoEl.value.currentTime = mrkr.signed.start;
  audioEl.value.currentTime = mrkr.spoken.start;
  audioPlaybackRateAdjustmentsPaused = false;
  // TODO: probably need to make this adjustment happen at the next time update from the
  // audio player so that we know it actually finished its seek:
  updateAudioPlaybackRate();
}

function updateAudioPlaybackRate(): void {
  if (audioPlaybackRateAdjustmentsPaused) {
    return;
  }

  const $vid = videoEl.value,
    $aud = audioEl.value,
    marker = playbackStatus.value.currentMarker;

  if (!$vid || !$aud || !marker) {
    return;
  }

  const vidPast = $vid.currentTime - marker.signed.start,
    vidDuration = marker.signed.end - marker.signed.start,
    vidPastPctg = vidPast / vidDuration,
    audPast = $aud.currentTime - marker.spoken.start,
    audDuration = marker.spoken.end - marker.spoken.start,
    audPastPctg = audPast / audDuration,
    audExpectedTime = (audDuration * vidPastPctg) + marker.spoken.start,
    // see if the audio is within one second (on either side)
    // of where this audio marker should start
    isAudioClose = ($aud.currentTime >= (audExpectedTime - 1)) && ($aud.currentTime <= (audExpectedTime + 1));

  console.debug(`vid at ${$vid.currentTime.toFixed(2)} of ${marker.signed.start.toFixed(2)}-${marker.signed.end.toFixed(2)} (${(vidPastPctg * 100).toFixed(2)}% of ${vidDuration.toFixed(2)} sec); aud at ${$aud.currentTime.toFixed(2)} (expected ${audExpectedTime.toFixed(2)}) of ${marker.spoken.start.toFixed(2)}-${marker.spoken.end.toFixed(2)} (${(audPastPctg * 100).toFixed(2)}% of ${audDuration.toFixed(2)} sec)`);

  if (!isAudioClose) {
    console.info(`audio was not close: at ${$aud.currentTime}, expected ${audExpectedTime}, so seeking`);
    $aud.currentTime = audExpectedTime;
  }

  const vidRemaining = marker.signed.end - $vid.currentTime,
  audRemaining = marker.spoken.end - $aud.currentTime,
  playbackRate = (audRemaining / vidRemaining) * $vid.playbackRate;

  if (playbackRate !== Infinity) {
    console.debug(`Updating audio playback rate to ${playbackRate}`);
    $aud.playbackRate = playbackRate;
    playbackStatus.value.audioPlaybackRate = playbackRate;
  }
}

// Everything in the <script> tag is basically "onInitialize" so will not run again if we
// navigate back to this page. To have things run again, use onMounted.

onMounted(() => {
  data.getAvailableBooks().then((availBooks) => {
    hebrewScriptures.value = availBooks.filter((b) => { return b.num < 40; });
    greekScriptures.value = availBooks.filter((b) => { return b.num >= 40; });
    loading.value = false;

    if (PLAYER_DEBUG_MODE) {
      setTimeout(() => {
        selectedBook.value = availBooks.find((bk) => { return bk.num === 40; });
      }, 1000);
    }
  });
});

// TODO: this probably creates some kind of bug ... I imagine these elements will probably
// be destroyed at some point and then recreated
watch([ videoEl, audioEl ], () => {
  const $vid = videoEl.value,
        $aud = audioEl.value;

  if (!$vid || !$aud) {
    return;
  }

  // TODO: not sure why the HTML controls="false" isn't working ...
  $vid.controls = false;

  $aud.addEventListener('timeupdate', () => { playbackStatus.value.audioTime = $aud.currentTime; })
  $vid.addEventListener('timeupdate', () => {
    playbackStatus.value.videoTime = $vid.currentTime;

    if (!playerData.value?.markers) {
      return;
    }

    const marker = playerData.value.markers.find((m) => {
      return $vid.currentTime >= m.signed.start && $vid.currentTime < m.signed.end;
    });

    if (marker !== playbackStatus.value.currentMarker) {

      if (!marker) {
        return;
      }

      playbackStatus.value.currentMarker = marker;
      updateAudioPlaybackRate();
    }
  });

  $vid.addEventListener('play', () => {
    playbackStatus.value.playing = true;
  });
  $aud.addEventListener('play', () => {
    playbackStatus.value.playing = true;
    $vid.play();
  });

  $vid.addEventListener('pause', () => {
    playbackStatus.value.playing = false;
  });
  $aud.addEventListener('pause', () => {
    playbackStatus.value.playing = false;
    $vid.pause();
  });

});

watch([ selectedBook ], () => {
  if (!selectedBook.value) {
    return;
  }

  const chapters: number[] = [];

  for (let chap = 1; chap <= selectedBook.value.chapters; chap++) {
    chapters.push(chap);
  }

  availableChapters.value = chapters;

  if (PLAYER_DEBUG_MODE) {
    setTimeout(() => {
      selectedChapter.value = 24;
    }, 1000);
  }
});

watch([ selectedBook, selectedChapter ], async () => {
  console.info(`watch called ${selectedBook.value?.name} ${selectedChapter.value}`);
  if (!selectedBook.value || !selectedChapter.value) {
    console.info('remove player data');
    playerData.value = undefined;
    return;
  }

  console.info('start loading player data');
  loading.value = true;

  const mediaData = await data.getMediaData(selectedBook.value.num, selectedChapter.value);

  console.info('finish loading player data');
  console.info('mediaData', mediaData);

  loading.value = false;
  playerData.value = mediaData;
});
</script>

<style scoped>
#loading {
  text-align: center;
  position: absolute;
  left: 0;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
}

.bookCollection, .chapterCollection {
  margin: 1em;
}

.books, .chapters {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  column-gap: 0.3em;
  row-gap: 0.3em;
}
.books .book, .chapters .chapter {
  border: 1px solid grey;
  padding: 0.8em;
  text-align: center;
}
.books .book {
  color: rgb(240, 240, 240);
}
.book.bk1, .book.bk2, .book.bk3, .book.bk4, .book.bk5,
.book.bk23, .book.bk24, .book.bk25, .book.bk26, .book.bk27, .book.bk28, .book.bk29,
.book.bk30, .book.bk31, .book.bk32, .book.bk33, .book.bk34, .book.bk35, .book.bk36,
.book.bk37, .book.bk38, .book.bk39,
.book.bk40, .book.bk41, .book.bk42, .book.bk43, .book.bk44,
.book.bk66 {
  background-color: rgb(29, 50, 84);
}
.book.bk6, .book.bk7, .book.bk8, .book.bk9, .book.bk10, .book.bk11, .book.bk12,
.book.bk13, .book.bk14, .book.bk15, .book.bk16, .book.bk17,
.book.bk45 {
  background-color: rgb(74, 109, 167);
}
.book.bk18, .book.bk19, .book.bk20, .book.bk21, .book.bk22,
.book.bk46, .book.bk47, .book.bk48, .book.bk49, .book.bk50, .book.bk51, .book.bk52,
.book.bk53, .book.bk54, .book.bk55, .book.bk56, .book.bk57, .book.bk58, .book.bk59,
.book.bk60, .book.bk61, .book.bk62, .book.bk63, .book.bk64, .book.bk65 {
  background-color: rgb(39, 81, 151);
}

.contentArea {
  margin: 0;
}

.mediaPlayer { /** the "page" for media playback */
  position: relative;
  /* display: inline-block; */
  width: 100vw;
  height: 100vh;
}

.videoPlayer {
  width: 100%;
  margin: 0;
  padding: 0;
  position: absolute;
  top: 50%;
  -ms-transform: translateY(-50%);
  transform: translateY(-50%);
}

video {
  width: 100%;
  max-width: 100vw;
  max-height: 100vh;
}

audio {
  width: 100%;
  display: none;
}

.mediaPlayerOverlay {
  background-color: rgba(0, 0, 0, 0.4);
  color: rgb(240, 240, 240);
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  width: 100vw;
  height: 100vh;

  padding-top: var(--ion-safe-area-top);
  padding-left: var(--ion-safe-area-left);
  padding-right: var(--ion-safe-area-right);
  padding-bottom: var(--ion-safe-area-bottom);

  opacity: 1;
  transition: opacity 0.6s ease-in;

  display: grid;
  grid-template-columns: 3fr 1fr;
  grid-column-gap: 1em;
  grid-template-rows: auto 1fr auto;
  grid-template-areas:
    "header markers"
    "debug markers"
    "footer footer";
}

.mediaPlayerOverlay.hidden {
  opacity: 0;
  transition: opacity 0.6s ease-out;
}

.mediaPlayerOverlay .playerControls {
  grid-area: footer;
}

.mediaPlayerOverlay .playerControls button:first-of-type {
  margin-left: 0;
}

.mediaPlayerOverlay .playerControls button {
  padding: 1em;
  margin: 0 1em;
  background-color: rgba(0, 0, 0, 0.4);
  color: rgb(240, 240, 240);
}
@media (prefers-color-scheme: dark) {
  .mediaPlayerOverlay .playerControls button {
    background-color: rgba(200, 200, 200, 0.4);
  }
}

.mediaPlayerOverlay .overlayHeader {
  grid-area: header;
  padding: 0 1em;
}

.mediaPlayerOverlay .playerDebug {
  grid-area: debug;
  display: flex;
  align-items: end;
}

.mediaPlayerOverlay .playerDebug .debugInfo {
  background-color: rgba(100, 100, 100, 0.7);
  color: rgb(240, 240, 240);
  padding: 1em;
  margin-bottom: 3em;
  border-radius: 0 1.5em 1.5em 0;
}

h3 button {
  width: 2em;
  height: 2em;
  background-color: rgba(0, 0, 0, 0.4);
  color: rgb(240, 240, 240);
  border: 1px solid rgba(230, 230, 230, 0.8);
}
@media (prefers-color-scheme: dark) {
  h3 button {
    background-color: rgba(200, 200, 200, 0.2);
  }
}

.mediaPlayerOverlay .playerDebug .debugInfo button {
  width: 2em;
  height: 2em;
  border: 1px solid rgba(230, 230, 230, 0.8);
  background-color: rgba(0, 0, 0, 0.4);
  color: rgb(240, 240, 240);
}

.mediaPlayerOverlay .markerListContainer {
  grid-area: markers;
  min-width: 240px;
  overflow: scroll;
}

.mediaPlayerOverlay .markerListContainer ul.markers {
  padding: 0;
  margin: 0;
  background-color: rgba(0, 0, 0, 0.4);
}

.mediaPlayerOverlay .markerListContainer ul.markers li {
  list-style-type: none;
  padding: 0.8em 0.3em;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.6);
}

.mediaPlayerOverlay .markerListContainer ul.markers li.active {
  background-color: rgba(255, 255, 255, 0.15);
}
</style>
