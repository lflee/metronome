var audioContext = null;
var isPlaying = false;      // Are we currently playing?
var startTime;              // The start time of the entire sequence.

var current48thNote;        // llf: LCM of 12 and 16 == 48, select different multipliers for (8, 16) or (12) count
var tempo = 60.0;          // tempo (in beats per minute)
                            // llf: starting at 120 is too fast for me
var lookahead = 25.0;       // How frequently to call scheduling function
                            //(in milliseconds)
var scheduleAheadTime = 0.1;    // How far ahead to schedule audio (sec)
                            // This is calculated from lookahead, and overlaps
                            // with next interval (in case the timer is late)
var nextNoteTime = 0.0;     // when the next note is due.
var noteResolution = 3;     // 0 == 16th, 1 == 8th, 2 == quarter note
                            // llf: Add 3 == 8th tripet




var noteLength = 0.05;      // length of "beep" (in seconds)
var canvas,                 // the canvas element
    canvasContext;          // canvasContext is the canvas' context 2D

var last48thNoteDrawn = -1; // the last "box" we drew on the screen

var notesInQueue = [];      // the notes that have been put into the web audio,
                            // and may or may not have played yet. {note, time}
var timerWorker = null;     // The Web Worker used to fire timer messages

// First, let's shim the requestAnimationFrame API, with a setTimeout fallback
window.requestAnimFrame = (function(){
    return  window.requestAnimationFrame ||
    window.webkitRequestAnimationFrame ||
    window.mozRequestAnimationFrame ||
    window.oRequestAnimationFrame ||
    window.msRequestAnimationFrame ||
    function( callback ){
        window.setTimeout(callback, 1000 / 60);
    };
})();

function nextNote() {
    // Advance current note and time by a 16th note...
    var secondsPerBeat = 20.0 / tempo;    // Notice this picks up the CURRENT
                                          // tempo value to calculate beat length.
                                          // set reference time as 20 as we have are actually having 48 notes in 4 bars

    nextNoteTime += 0.25 * secondsPerBeat;    // Add beat length to last beat time

    current48thNote++;    // Advance the beat number, wrap to zero
    if (current48thNote == 48) {
        current48thNote = 0;
    }
}

function scheduleNote( beatNumber, time ) {
    // push the note on the queue, even if we're not playing.
    notesInQueue.push( { note: beatNumber, time: time } );

    if ( (noteResolution==0) && (beatNumber%3)) // not playing non-16th 48th notes
      return ;
    if ( (noteResolution==1) && (beatNumber%6)) // not playing non-8th 48th notes
      return ;
    if ( (noteResolution==2) && (beatNumber%12)) // not playing non-4th 48th notes
      return ;
    if ( (noteResolution==3) && (beatNumber%4)) // not playing non-8th-triplet 48th notes
      return ;

    // create an oscillator
    var osc = audioContext.createOscillator();
    osc.connect( audioContext.destination );

    if (beatNumber % 48 === 0)          // llf: beat 0 ==  high pitch
        osc.frequency.value = 660.0;    // llf: 880 seems too high for me
    else if (beatNumber % 12 === 0 )    // quarter notes == medium pitch
        osc.frequency.value = 440.0;
    else                                // other 16th notes = low pitch
        osc.frequency.value = 220.0;

    osc.start( time );
    osc.stop( time + noteLength );
}

function scheduler() {
    // while there are notes that will need to play before the next interval,
    // schedule them and advance the pointer.
    while (nextNoteTime < audioContext.currentTime + scheduleAheadTime ) {
        scheduleNote( current48thNote, nextNoteTime );
        nextNote();
    }
}

function play() {
    isPlaying = !isPlaying;

    if (isPlaying) { // start playing
        current48thNote = 0;
        nextNoteTime = audioContext.currentTime;
        timerWorker.postMessage("start");
        return "stop";
    } else {
        timerWorker.postMessage("stop");
        return "play";
    }
}

function resetCanvas (e) {
    // resize the canvas - but remember - this clears the canvas too.
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    //make sure we scroll to the top left.
    window.scrollTo(0,0);
}

function draw() {
    var currentNote = last48thNoteDrawn;
    var currentTime = audioContext.currentTime;

    while (notesInQueue.length && notesInQueue[0].time < currentTime) {
        currentNote = notesInQueue[0].note;
        notesInQueue.splice(0,1);   // remove note from queue
    }

    // We only need to draw if the note has moved.
    if (last48thNoteDrawn != currentNote) {
        var x = Math.floor( canvas.width / 50 );
        canvasContext.clearRect(0,0,canvas.width, canvas.height);
        for (var i=0; i<48; i++) {
            canvasContext.fillStyle = ( currentNote == i ) ?
                ((currentNote%12 === 0)?"red":"blue") : "white";
            canvasContext.fillRect( x * (i+1), x, 2*x, 2*x );
        }
        last48thNoteDrawn = currentNote;
    }

    // set up to draw again
    requestAnimFrame(draw);
}

function init(){
    var container = document.createElement( 'div' );

    container.className = "container";
    canvas = document.createElement( 'canvas' );
    canvasContext = canvas.getContext( '2d' );
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild( container );
    container.appendChild(canvas);
    canvasContext.strokeStyle = "#ffffff";
    canvasContext.lineWidth = 2;

    // NOTE: THIS RELIES ON THE MONKEYPATCH LIBRARY BEING LOADED FROM
    // Http://cwilso.github.io/AudioContext-MonkeyPatch/AudioContextMonkeyPatch.js
    // TO WORK ON CURRENT CHROME!!  But this means our code can be properly
    // spec-compliant, and work on Chrome, Safari and Firefox.

    // audioContext = new AudioContext();
    audioContext = new AudioContext("sounds/elephant.mp3");

    // if we wanted to load audio files, etc., this is where we should do it.

    window.onorientationchange = resetCanvas;
    window.onresize = resetCanvas;

    requestAnimFrame(draw);    // start the drawing loop.

    timerWorker = new Worker("js/metronomeworker.js");

    timerWorker.onmessage = function(e) {
        if (e.data == "tick") {
            // console.log("tick!");
            scheduler();
        }
        else
            console.log("message: " + e.data);
    };
    timerWorker.postMessage({"interval":lookahead});
}

window.addEventListener("load", init );
