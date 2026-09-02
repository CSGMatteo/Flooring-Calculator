import React, { useState } from "react";

export default function Maintenance({ setMode }) {

  
    return (
                <div className="bg-white rounded-2xl shadow-xl p-10 text-center space-y-6">
                    <h1 className="text-3xl font-bold text-center">
                        This Section Is Currently Not Available
                    </h1>

                    <button
                        className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
                        onClick={() => setMode("mainMenu")}
                    >
                        Main Menu
                    </button>
                </div>
    )
}