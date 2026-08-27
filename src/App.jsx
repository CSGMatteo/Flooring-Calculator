import React, { useState } from "react";
import { Card, CardContent } from "./components/ui/card.jsx";
import { Button } from "./components/ui/button.jsx";
import './index.css'
import { parse } from "postcss";
import ScannerModal from "./components/ScannerModal.jsx";
import SampleSignOut from "./components/SampleSignOut.jsx";
import StairCalculator from "./components/StairCalculator.jsx";
import RoomCalculator from "./components/RoomCalculator.jsx";
import Maintenance from "./components/Maintenance.jsx";
import VinylClickRoom from "./components/RoomCalculators/VinylClickRoom.jsx";
import VinylGlueRoom from "./components/RoomCalculators/VinylGlueRoom.jsx";
import LaminateRoom from "./components/RoomCalculators/LaminateRoom.jsx";
import HardwoodRoom from "./components/RoomCalculators/HardwoodRoom.jsx";


export default function App() {
  
  const [mode, setMode] = useState("mainMenu");
  const [step, setStep] = useState("main");
 
  const formatMoney = (value) =>
    value?.toLocaleString("en-CA", {
      style: "currency",
      currency: "CAD"
    });

  const backgrounds = {
    mainMenu: "bg-gradient-to-br from-blue-500 to-yellow-500",
    calculations: "bg-gradient-to-br from-blue-500 to-indigo-700",
    stairs: "bg-gradient-to-br from-cyan-500 to-indigo-700",
    maintenance: "bg-gradient-to-br from-amber-400 to-orange-600",
    rooms: "bg-gradient-to-br from-cyan-500 to-indigo-700",
    sampleSignOut: "bg-gradient-to-br from-green-500 to-blue-700",
    vinylClickRoom: "bg-gradient-to-br from-cyan-500 to-indigo-700",
    vinylGlueRoom: "bg-gradient-to-br from-cyan-500 to-indigo-700",
    laminateRoom: "bg-gradient-to-br from-cyan-500 to-indigo-700",
    hardwoodRoom: "bg-gradient-to-br from-cyan-500 to-indigo-700",
  };

  const backgroundClass = backgrounds[mode] || "bg-gray-100";

  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannedItem, setScannedItem] = useState(null)

  const [result, setResult] = useState(null);

  const [quote, setQuote] = useState({
    floorType: "",
    rooms: [],
    boxsqft: 0,
    roomCost: 0,
    roomInstall: false,
    roomRemoval: false,
    globalRemovalType: "",
    extras: [],
    totals: {}
  })



  function resetApp() {
  setMode("mainMenu")
  setStep("main");
}

  return (
  <div className={`min-h-screen flex items-center justify-center ${backgroundClass} animate-gradient`}>
    <div className="w-full max-w-3xl">

      {mode === "mainMenu" && (
        <>
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
          <h1 className="text-3xl font-bold text-center">
            MAIN MENU
          </h1>

          <button
            className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
            onClick={() => {
              setMode("calculations")
            }}
          >
            Calculations
          </button>

          <button
            className="w-full text-xl py-6 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold transition"
            onClick={() => {
              setMode("sampleSignOut")
            }}
          >
            Sample Signout/Return
          </button>

          <button
            className="w-full text-xl py-6 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition"
            onClick={() => setScannerOpen(true)}
          >
            Scan Product
          </button>

        </div>
        {scannerOpen && (
          <ScannerModal
           onClose={() => setScannerOpen(false)}
           onSelect={(item) => {
            setScannedItem(item);
            setScannerOpen(false);
           }}
          />
        )}
        </>
      )}

      {mode === "calculations" && (
        <>
        <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
          <h1 className="text-3xl font-bold text-center">
            What Would You Like To Calculate?
          </h1>

          <button
            className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
            onClick={() => {
              setMode("stairs")
            }}
          >
           Stairs
          </button>

          <button
            className="w-full text-xl py-6 bg-green-600 hover:bg-green-700 text-white rounded-xl font-semibold transition"
            onClick={() => {
              setMode("rooms")
              setStep("decideFloorRooms");
            }}
          >
            Room Calculator
          </button>

          <button
            className="w-full text-xl py-6 bg-orange-600 hover:bg-orange-700 text-white rounded-xl font-semibold transition"
            onClick={() => {
              setMode("maintenance")
            }}
          >
            Out of Order
          </button>

          <button
            className="w-full text-xl py-6 bg-gray-500 hover:bg-gray-600 text-white rounded-xl font-semibold transition"
            onClick={() => {
              setMode("mainMenu")
            }}
          >
            Back
          </button>
        </div>
        </>
      )}

      {mode === "sampleSignOut" && (
        <SampleSignOut setMode={setMode} />
      )}

      {mode === "stairs" && (
        <StairCalculator setMode={setMode} />
      )}

      {mode === "maintenance" && (
        <Maintenance 
          onBack={() => setMode("menu")} />
      )}

      {mode === "rooms" && (
        <RoomCalculator setMode={setMode} />
      )}

      {mode === "vinylClickRoom" && (
        <VinylClickRoom 
        quote={quote}
        setQuote={setQuote}
        setMode={setMode} />
      )}

      {mode === "vinylGlueRoom" && (
        <VinylGlueRoom setMode={setMode} />
      )}

      {mode === "laminateRoom" && (
        <LaminateRoom setMode={setMode} />
      )}

      {mode === "hardwoodRoom" && (
        <HardwoodRoom setMode={setMode} />
      )}

    </div>
  </div>
);
}