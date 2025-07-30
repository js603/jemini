/**
 * Test script to verify the fix for the serverTimestamp() issue in country selection
 * 
 * This script simulates the country selection process to ensure that the error
 * "FirebaseError: Function updateDoc() called with invalid data. serverTimestamp() is not currently supported inside arrays"
 * no longer occurs.
 */

// Import required Firebase modules
const { initializeApp } = require('firebase/app');
const { getFirestore, doc, getDoc, updateDoc, collection, addDoc, serverTimestamp } = require('firebase/firestore');
const { getAuth, signInAnonymously } = require('firebase/auth');

// Firebase configuration (replace with your actual config)
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_AUTH_DOMAIN",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_STORAGE_BUCKET",
  messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

/**
 * Test function to simulate country selection
 */
async function testCountrySelection() {
  try {
    // Sign in anonymously
    const userCredential = await signInAnonymously(auth);
    const user = userCredential.user;
    console.log("Signed in anonymously as:", user.uid);

    // Create a test game
    const gameData = {
      name: "Test Game",
      status: "waiting",
      turn: 1,
      players: [
        {
          uid: user.uid,
          name: "Test Player",
          status: "playing",
          isTurnReady: false
        }
      ],
      nations: {
        "테스트 국가": {
          name: "테스트 국가",
          resources: 100,
          stability: 80
        }
      },
      events: [],
      map: {},
      createdAt: serverTimestamp()
    };

    // Add the test game to Firestore
    const gameRef = await addDoc(collection(db, "games"), gameData);
    console.log("Created test game with ID:", gameRef.id);

    // Get the game data
    const gameDoc = await getDoc(gameRef);
    const game = { id: gameDoc.id, ...gameDoc.data() };
    console.log("Retrieved game data:", game);

    // Simulate country selection
    const nationName = "테스트 국가";
    const playerIndex = game.players.findIndex(p => p.uid === user.uid);
    
    if (playerIndex !== -1) {
      const updatedPlayers = [...game.players];
      updatedPlayers[playerIndex].nation = nationName;
      updatedPlayers[playerIndex].lastActive = new Date().toISOString(); // Using ISO string instead of serverTimestamp
      
      const updatedNations = { 
        ...game.nations, 
        [nationName]: { 
          ...game.nations[nationName], 
          owner: user.uid 
        } 
      };
      
      // Update the game document
      await updateDoc(gameRef, { 
        players: updatedPlayers, 
        nations: updatedNations,
        lastNationSelectionTime: serverTimestamp() // Store server timestamp at the top level
      });
      
      console.log("Country selection successful!");
      
      // Verify the update
      const updatedGameDoc = await getDoc(gameRef);
      const updatedGame = { id: updatedGameDoc.id, ...updatedGameDoc.data() };
      console.log("Updated game data:", updatedGame);
      console.log("Player's nation:", updatedGame.players[playerIndex].nation);
      console.log("Nation's owner:", updatedGame.nations[nationName].owner);
    } else {
      console.error("Player not found in the game!");
    }
  } catch (error) {
    console.error("Error during test:", error);
  }
}

// Run the test
testCountrySelection().then(() => {
  console.log("Test completed.");
}).catch(error => {
  console.error("Test failed:", error);
});