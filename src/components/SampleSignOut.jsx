import { useState, useRef } from "react";
import ScannerModal from "./ScannerModal";
import { supabase } from "../supabaseClient";

export default function SampleSignOut({ setMode }) {

  const [scannerOpen, setScannerOpen] = useState(false)

  const [step, setStep] = useState("signOutOptions");

  const [customerInfo, setCustomerInfo] = useState({
    name: "",
    number: "",
    employee: ""
  });

  const [cartItems, setCartItems] = useState([]);
  const [barcode, setBarcode] = useState("");
  const [results, setResults] = useState([]);

  const [notFoundBarcode, setNotFoundBarcode] = useState("");
  const [miscOpen, setMiscOpen] = useState(false);
  const [miscDescription, setMiscDescription] = useState("");

  const [returnBarcode, setReturnBarcode] = useState("");
  const [returnItems, setReturnItems] = useState([]);
  const [returnScannerOpen, setReturnScannerOpen] = useState(false);

  const [activeSamples, setActiveSamples] = useState([]);
  const [activeLoading, setActiveLoading] = useState(false);
  const [activeSearch, setActiveSearch] = useState("")

  const filteredActiveSamples = activeSamples.filter(item => {
    const search = activeSearch.toLowerCase();

    return (
      item.customer_name?.toLowerCase().includes(search) ||
      item.customer_phone?.toLowerCase().includes(search) ||
      item.employee_name?.toLowerCase().includes(search) ||
      item.sample_name_snapshot?.toLowerCase().includes(search) ||
      item.barcode_snapshot?.toLowerCase().includes(search)
    );
  });

  const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzAcdiYAZOqw4mZj7YX2gF1acPEfZh1aXBEx2YXuVsjPZOTrM9YVEp0WLNgQ3Eif5Dqcg/exec"
  
  async function searchBarcode(forcedBarcode = null) {
    let code = forcedBarcode ?? barcode;

    if (typeof code !== "string") {
      code = barcode;
    }

    code = code.trim();

    if (!code) {
      alert("No barcode entered");
      return;
    }

    // Universal unlisted-sample barcode
    if (code === "99999999") {
      setBarcode("")
      setNotFoundBarcode("");
      setMiscOpen(true);
      return;
    }

    try {
      console.log("Searching Supabase for:", code);

      const { data, error } = await supabase
        .from("Samples")
        .select("id, barcode, sample_name")
        .eq("barcode", code)
        .single();

      if (error) {
        console.error("SUPABASE ERROR:", error);

        // No matching sample
        if (error.code === "PGRST116") {
          setNotFoundBarcode(code);
          setBarcode("");
          return;
        }

        alert("Error searching sample");
        return;
      }

      console.log("FOUND SAMPLE", data);

      addToCart(data);

    } catch (err) {
      console.error(err);
      alert("Error searching sample");
    }
  }

  async function searchReturnBarcode(forcedBarcode = null) {
    let code = forcedBarcode ?? returnBarcode;

    if (typeof code !== "string") {
      code = returnBarcode;
    }

    code = code.trim();

    if (!code) {
      alert("No barcode entered")
      return
    }

    try {
      const res = await fetch(
        `/api/find-active-sample?barcode=${encodeURIComponent(code)}`
      );

      const data = await res.json();

      if (!res.ok || !data.success) {
        alert(data.error || "Samples could not be found");
        setReturnBarcode("")
        return;
      }

      setReturnItems(prev => {
        const alreadyAdded = prev.some(
          item => item.id === data.item.id
        );

        if (alreadyAdded) {
          return prev;
        }

        return [...prev, data.item];
      });

      setReturnBarcode("");

    } catch (err) {
      console.error("RETURN LOOKUP ERROR:", err);
      alert("Error searching for returned sample");
    }
  }

  async function confirmReturns() {
    if (!returnItems.length) {
      alert("No samples selected");
      return;
    }

    try {
      const res = await fetch("/api/return-samples", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          itemIds: returnItems.map(item => item.id)
        })
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unable to return samples"
        );
      }

      alert(
        `${data.returnedCount} sample${
          data.returnedCount === 1 ? "" : "s"
        } returned`
      );

      setReturnItems([]);
      setReturnBarcode("")
      setStep("signOutOptions");

    } catch (err) {
      console.error("RETURN ERROR:", err);
      alert(`Return faild: ${err.message}`);
    }
  }

  async function loadActiveSamples() {
    setActiveLoading(true);

    try {
      const res = await fetch("/api/active-samples");
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unable to load samples"
        );
      }

      setActiveSamples(data.items);

    } catch (err) {
      console.error("ACTIVE SAMPLE ERROR:", err);
      alert(`Unable to load samples: ${err.message}`);
    } finally {
      setActiveLoading(false)
    }
  }

  function addToCart(item) {
    setCartItems(prev => {
      const alreadyAdded = prev.some(
        existing => existing.id === item.id
      );

      if (alreadyAdded) {
        return prev;
      }

      return [...prev, item];
    });

    setResults([]);
    setBarcode("");
  }

  async function signOut() {
    if (!cartItems.length) {
      alert("Cart is empty");
      return;
    }

    try {
      const res = await fetch("/api/signout", {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          customerInfo,
          items: cartItems
        })
      });

      const data = await res.json();

      console.log("SIGNOUT RESPONSE:", data);

      if (!res.ok || !data.success) {
        throw new Error(
          data.error || "Unknown sign out error"
        );
      }

      alert("Samples Signed Out");

      setCartItems([]);

      setCustomerInfo({
        name: "",
        number: "",
        employee: ""
      });

      setMode("menu");

    } catch (err) {
      console.error("SIGN OUT ERROR:", err);

      alert(
        `Sign out failed: ${err.message}`
      );
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-10 space-y-6">

      {step === "signOutOptions" && (
      <div className="space-y-6">
        <h1 className="text-3xl font-bold text-center">
          Returning or Signing Out?
        </h1>
        <button
          className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
          onClick={() => setStep("info")}
        >
          Sign Out Samples
        </button>

        <button
          className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
          onClick={() => setStep("return")}
        >
          Return Samples
        </button>

        <button
          className="w-full text-xl py-6 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold transition"
          onClick={() => {
            setStep("outSamples");
            loadActiveSamples();
          }}
        >
          Samples Currently Out
        </button>

        <button
          className="w-full text-xl py-6 bg-gray-400 hover:bg-gray-500 text-black rounded-xl font-semibold transition"
          onClick={() => setMode("menu")}
        >
          Main Menu
        </button>
      </div>
      )}

      {/* INFO STEP */}
      {step === "info" && (
        <>
          <h1 className="text-2xl font-bold text-center">Customer Info</h1>

          <input
            placeholder="Customer Name"
            className="border p-3 w-full"
            onChange={(e) =>
              setCustomerInfo(prev => ({ ...prev, name: e.target.value }))
            }
          />

          <input
            placeholder="Customer Number"
            className="border p-3 w-full"
            onChange={(e) =>
              setCustomerInfo(prev => ({ ...prev, number: e.target.value }))
            }
          />

          <input
            placeholder="Employee Name"
            className="border p-3 w-full"
            onChange={(e) =>
              setCustomerInfo(prev => ({ ...prev, employee: e.target.value }))
            }
          />

          <button
            className="w-full bg-blue-600 text-white p-4 rounded-xl"
            onClick={() => {
              if (!customerInfo.name || !customerInfo.number || !customerInfo.employee) {
                alert("Fill all fields");
                return;
              }

              setStep("search");
            }}
          >
            Proceed
          </button>

          <button
            className="w-full bg-gray-400 p-4 rounded-xl"
            onClick={() => setMode("menu")}
          >
            Back
          </button>
        </>
      )}

      {/* SEARCH STEP */}
      {step === "search" && (
        <>
          <h1 className="text-2xl font-bold text-center">Search Samples</h1>

          <button
            className="bg-gray-500 text-white p-3 rounded-xl"
            onClick={() => setScannerOpen(true)}
          >
            Scan Barcode
          </button>

          <input
            placeholder="Enter Barcode"
            className="border p-3 w-full"
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchBarcode();
              }
            }}
          />

          {notFoundBarcode && (
            <div className="border border-red-300 bg-red-50 p-4 rounded-xl space-y-3">
              <p className="font-semibold">
                Barcode {notFoundBarcode} was not found.
              </p>

              <button
                className="bg-blue-600 text-white px-4 py-2 rounded-xl"
                onClick={() => setMiscOpen(true)}
              >
                Add as Unlisted Sample
              </button>

              <button
                className="bg-gray-400 px-4 py-2 rounded-xl ml-2"
                onClick={() => setNotFoundBarcode("")}
              >
                Cancel
              </button>
            </div>
          )}

          <button
            className="bg-blue-600 text-white p-3 rounded-xl"
            onClick={() => searchBarcode(barcode)}
          >
            Search
          </button>

          <button
            className="bg-yellow-500 text-black p-3 rounded-xl"
            onClick={() => {
              setNotFoundBarcode("");
              setMiscOpen(true);
            }}
          >
            Add Unlisted Sample
          </button>

          {/* RESULTS */}
          {results.map((item, i) => (
            <div key={i} className="border p-3 rounded">
              {item}
              <button
                className="ml-4 bg-blue-500 text-white px-2 py-1 rounded"
                onClick={() => addToCart(item)}
              >
                Add
              </button>
            </div>
          ))}

          {/* CART */}
          <h3 className="font-bold">Cart</h3>

          {cartItems.map((item, i) => (
            <div key={item.id} className="flex justify-between border p-2 rounded">
              <div>
                <div>{item.sample_name}</div>

                <div className="text-sm text-gray-500">
                  Barcode: {item.barcode}
                </div>
              </div>
              <span
                className="text-red-500 cursor-pointer"
                onClick={() =>
                  setCartItems(prev =>
                    prev.filter((_, index) => index !== i)
                  )
                }
              >
                ✕
              </span>
            </div>
          ))}

          <button
            className="w-full bg-green-600 text-white p-4 rounded-xl"
            onClick={signOut}
          >
            Sign Out
          </button>

          <button
            className="w-full bg-gray-400 p-4 rounded-xl"
            onClick={() => setStep("info")}
          >
            Back
          </button>

          {scannerOpen && (
            <ScannerModal
              onClose={() => setScannerOpen(false)}
              onSelect={(item) => {
                const scannedCode = 
                  item.Barcode || 
                  item.barcode || 
                  item["Barcode"] ||
                  item["Item Code"];

                if (!scannedCode) {
                  alert("No barcode found on item");
                  return;
                }

                setBarcode(scannedCode);
                setScannerOpen(false);
                searchBarcode(scannedCode);
              }}
            />
          )}

          {miscOpen && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">

                <h3 className="text-xl font-bold text-center">
                  Add Unlisted Sample
                </h3>

                {notFoundBarcode && (
                  <p className="text-center">
                    Barcode: <strong>{notFoundBarcode}</strong>
                  </p>
                )}

                <input
                  type="text"
                  placeholder="Enter Sample Description"
                  className="border p-3 w-full rounded"
                  value={miscDescription}
                  onChange={(e) => setMiscDescription(e.target.value)}
                  autoFocus
                />

                <div className="flex gap-3">

                  <button
                    className="flex-1 bg-blue-600 text-white px-4 py-2 rounded-xl"
                    onClick={() => {
                      if (!miscDescription.trim()) {
                        alert("Enter a sample description");
                        return;
                      }

                      const miscItem = {
                        id: `misc-${crypto.randomUUID()}`,
                        barcode: notFoundBarcode || "UNLISTED",
                        sample_name: miscDescription.trim(),
                        is_unlisted: true
                      };
                      
                      addToCart(miscItem);

                      setMiscDescription("");
                      setNotFoundBarcode("");
                      setMiscOpen(false);
                    }}
                  >
                    Add Sample  
                  </button>

                  <button
                    className="flex-1 bg-gray-400 px-4 py-2 rounded-xl ml-2"
                    onClick={() => {
                      setMiscDescription("");
                      setMiscOpen(false);
                    }} 
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Return Step */}
      {step === "return" && (
        <div className="space-y-4">

          <h1 className="text-2xl font-bold text-center">
            Return Samples
          </h1>

          <button
            className="bg-gray-500 text-white p-3 rounded-xl"
            onClick={() => setReturnScannerOpen(true)}
          >
            Scan With Camera
          </button>

          <input
            placeholder="Scan or Enter Barcode"
            className="border p-3 w-full"
            value={returnBarcode}
            onChange={(e) =>
              setReturnBarcode(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                searchReturnBarcode();
              }
            }}
          />

          <button
            className="bg-blue-600 text-white p-3 rounded-xl"
            onClick={() => 
              searchReturnBarcode(returnBarcode)
            }
          >
            Search
          </button>

          <h3 className="font-bold">
            Returning ({returnItems.length})
          </h3>

          {returnItems.map((item, i) => (
            <div
              key={item.id}
              className="border p-4 rounded-xl"
            >
              <div className="flex justify-between gap-4">

                <div>
                  <div className="font-semibold">
                    {item.sample_name_snapshot}
                  </div>

                  <div className="text-sm text-gray-500">
                    Barcode: {item.barcode_snapshot}
                  </div>

                  <div className="mt-2">
                    Customer: <strong>{item.customer_name}</strong>
                  </div>

                  <div>
                    Phone: {item.customer_phone}
                  </div>

                  <div className="text-sm text-gray-500">
                    Signed out:{" "}
                    {new Date(
                      item.signed_out_at
                    ).toLocaleString()}
                  </div>
                </div>

                <span
                  className="text-red-500 cursor-pointer"
                  onClick={() =>
                    setReturnItems(prev =>
                      prev.filter(
                        (_, index) => index !== i
                      )
                    )
                  }
                >
                  ✕
                </span>

              </div>
            </div>
          ))}

          <button
            className="w-full bg-green-600 text-white p-4 rounded-xl"
            onClick={confirmReturns}
          >
            Confirm Returns
          </button>

          <button
            className="w-full bg-gray-400 p-4 rounded-xl"
            onClick={() => {
              setReturnItems([]);
              setReturnBarcode("");
              setStep("signOutOptions");  
            }}
          >
            Back
          </button>

          {returnScannerOpen && (
            <ScannerModal
              onClose={() =>
                setReturnScannerOpen(false)
              }
              onSelect={(item) => {
                const scannedCode =
                  item.Barcode ||
                  item.barcode ||
                  item["Barcode"] ||
                  item["Item Code"];
                
                if (!scannedCode) {
                  alert("No barcode found");
                  return;
                }

                setReturnScannerOpen(false);
                searchReturnBarcode(scannedCode);
              }}
            />
          )}
        </div>
      )}

      {/* Out Samples */}
      {step === "outSamples" && (
        <div className="space-y-4">

          <h1 className="text-2xl font-bold text-center">
            Samples Currently Out
          </h1>

          <input
            placeholder="Search customer, phone, sample or barcode"
            className="border p-3 w-full"
            value={activeSearch}
            onChange={(e) =>
              setActiveSearch(e.target.value)
            }
          />

          <button
            className="bg-blue-600 text-white px-4 py-2 rounded-xl"
            onClick={loadActiveSamples}
          >
            Refresh
          </button>

          {activeLoading && (
            <p>Loading...</p>
          )}

          {!activeLoading && 
            filteredActiveSamples.length === 0 && (
              <p className="text-center text-gray-500">
                No samples currently out.
              </p>
            )}

          {filteredActiveSamples.map(item => (
            <div
              key={item.id}
              className="border rounded-xl p-4"
            >

              <div className="font-bold text-lg">
                {item.sample_name_snapshot}
              </div>

              <div className="text-sm text-gray-500">
                Barcode: {item.barcode_snapshot}
              </div>

              <div className="mt-3">
                Customer:{" "}
                <strong>{item.customer_name}</strong>
              </div>

              <div>
                Phone: {item.customer_phone}
              </div>

              <div>
                Employee: {item.employee_name}
              </div>

              <div className="text-sm text-gray-500 mt-1">
                Signed out:{" "}
                {new Date(
                  item.signed_out_at
                ).toLocaleString()}
              </div>

            </div>
          ))}

          <button
            className="w-full bg-gray-400 p-4 rounded-xl"
            onClick={() => {
              setActiveSearch("");
              setStep("signOutOptions");
            }}
          >
            Back
          </button>

        </div>
      )}
    </div>
  );
}