<template>
  <ion-page>
    <ion-header :translucent="true">
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
          <div class="books">
            <div class="book" v-for="chap in availableChapters" :key="chap" @click="selectedChapter = chap">
              {{ chap }}
            </div>
          </div>
        </div>
        <div class="mediaPlayer" v-if="selectedBook && selectedChapter">
          <h3>
            <button @click="selectedChapter = undefined">&lt;</button>
            {{ selectedBook.name }} {{ selectedChapter }}
          </h3>
          <div id="videoPlayer" v-if="playerData">
            <video ref="videoEl"
              playsinline muted controls="false"
              poster="https://placebear.com/1920/1080"
              v-bind:src="playerData.signed.url"
            ></video>
            <audio ref="audioEl"
              controls="false"
              v-bind:src="playerData.spoken.url"
            ></audio>
          </div>
          <div id="playerControls" v-if="playerData">
            <button @click="playPause()">
              <span v-if="playbackStatus.playing">Pause</span>
              <span v-if="!playbackStatus.playing">Play</span>
            </button>
          </div>
          <div id="playerDebug" v-if="playerData">
            <br>
            Video rate:
            <button @click="updateVideoPlaybackRate(-0.2)">-</button>
            {{ playbackStatus.videoPlaybackRate.toFixed(1) }}
            <button @click="updateVideoPlaybackRate(0.2)">+</button>
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
          <div class="markerListContainer" v-if="playerData?.markers.length">
            <ul class="markers">
              <li v-for="mrkr in playerData.markers" :key="mrkr.id"
                @click="jumpToMarker(mrkr)"
                :class="playbackStatus.currentMarker?.id === mrkr.id ? 'active' : ''"
                >
                {{ mrkr.label }}
            </li>
            </ul>
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
      audioEl = ref<HTMLAudioElement>();

function playPause() {
  if (playbackStatus.value.playing) {
    audioEl.value?.pause();
  } else {
    audioEl.value?.play();
  }
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
  if (!videoEl.value) {
    return;
  }

  playbackStatus.value.currentMarker = mrkr;
  videoEl.value.currentTime = mrkr.signed.start;
}

function updateAudioPlaybackRate(): void {
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

  console.info(`vid at ${$vid.currentTime.toFixed(2)} of ${marker.signed.start.toFixed(2)}-${marker.signed.end.toFixed(2)} (${(vidPastPctg * 100).toFixed(2)}% of ${vidDuration.toFixed(2)} sec); aud at ${$aud.currentTime.toFixed(2)} (expected ${audExpectedTime.toFixed(2)}) of ${marker.spoken.start.toFixed(2)}-${marker.spoken.end.toFixed(2)} (${(audPastPctg * 100).toFixed(2)}% of ${audDuration.toFixed(2)} sec)`);

  if (!isAudioClose) {
    console.info(`audio was not close: at ${$aud.currentTime}, expected ${audExpectedTime}, so seeking`);
    $aud.currentTime = marker.spoken.start;
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
      return $vid.currentTime >= m.signed.start && $vid.currentTime <= m.signed.end;
    });

    if (marker !== playbackStatus.value.currentMarker) {
      console.info('signed marker change', marker, playbackStatus);

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

.contentArea {
  margin: 1em;
}

video {
  max-width: 100%;
}

audio {
  width: 100%;
  display: none;
}

.markerListContainer .markers {
  padding: 0;
  margin: 0;
  margin-top: 1em;
  padding-left: 1em;
}

.markerListContainer .markers li {
  list-style-type: none;
  padding: 1em;
  border: 1px solid rgba(255, 255, 255, 0.6);
}

.markerListContainer .markers li.active {
  background-color: rgba(255, 255, 255, 0.15);
}

.books {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr 1fr 1fr;
  column-gap: 0.3em;
  row-gap: 0.3em;
}

.books .book {
  border: 1px solid grey;
  padding: 0.8em;
  text-align: center;
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
</style>
