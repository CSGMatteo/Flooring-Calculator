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

    const [returnCustomerSearch, setReturnCustomerSearch] = useState("");
    const [returnCustomerResults, setReturnCustomerResults] = useState([]);

    const [selectedReturnCustomer, setSelectedReturnCustomer] = useState(null);
    const [selectedReturnIds, setSelectedReturnIds] = useState([]);

    const [scanReturnMatches, setScanReturnMatches] = useState([]);

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
    
    function addToReturnCart(item) {
      setReturnItems(prev => {

        const alreadyAdded = prev.some(
          existing => existing.id === item.id
        );

        if (alreadyAdded) {
          return prev;
        }

        return [...prev, item];
      });
    }

    function toggleReturnSelection(id) {
      setSelectedReturnIds(prev => {

        if (prev.includes(id)) {
          return prev.filter(
            selectedId => selectedId !== id
          );
        }

        return [...prev, id];
      })
    }

    function addSelectedReturnsToCart() {
      if (!selectedReturnCustomer) {
        return;
      }

      const selectedItems = 
        selectedReturnCustomer.items.filter(
          item =>
            selectedReturnIds.includes(item.id)
        )
        .map(item => ({
          ...item,

          // Carry customer information into the Return Cart
          customer_name:
            selectedReturnCustomer.customer_name,
          
          customer_phone:
            selectedReturnCustomer.customer_phone
        }));

      if (!selectedItems.length) {
        alert("Select at least one sample");
        return;
      }

      setReturnItems(prev => {

        const existingIds = new Set(
          prev.map(item => item.id)
        );

        const newItems =
          selectedItems.filter(
            item => !existingIds.has(item.id)
          );

        return [
          ...prev,
          ...newItems
        ];
      });

      setSelectedReturnIds([]);
      setSelectedReturnCustomer(null);
    }

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

      setScanReturnMatches([]);

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

        /*
          Only one active copy:
          just put it directly into cart
        */
        if (data.items.length === 1) {

          addToReturnCart(data.items[0]);

          setReturnBarcode("");
          setScanReturnMatches([]);

          return;
        }

        /*
          More than one active checkout has this barcode.

          Don't guess which one is being returned.
          Let the employee choos
        */

        setScanReturnMatches(data.items);

        setReturnBarcode("");

      } catch (err) {
        console.error("RETURN LOOKUP ERROR:", err);
        alert("Error searching for returned sample");
      }
    }

    async function searchReturnCustomer() {
      const query = returnCustomerSearch.trim();

      if (!query) {
        alert("Enter a customer name");
        return;
      }

      try {
        const res = await fetch(
          `/api/search-return-customer?query=${encodeURIComponent(query)}`
        );

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(
            data.error ||
            "Unable to search customers"
          );
        }

        setReturnCustomerResults(
          data.customers
        );

        setSelectedReturnCustomer(null);
        setSelectedReturnIds([]);

      } catch (err) {
        console.error(
          "CUSTOMER SEARCH ERROR:",
          err
        );

        alert(
          `Customer search failed: ${err.message}`
        );
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

        setReturnCustomerSearch("")
        setReturnCustomerResults([]);

        setSelectedReturnCustomer(null);
        setSelectedReturnIds([]);

        setScanReturnMatches([]);

        setStep("signOutOptions");

      } catch (err) {
        console.error("RETURN ERROR:", err);
        alert(`Return failed: ${err.message}`);
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

        setMode("mainMenu");

      } catch (err) {
        console.error("SIGN OUT ERROR:", err);

        alert(
          `Sign out failed: ${err.message}`
        );
      }
    }

    return (

      <div className="signout-container">

        {step === "signOutOptions" && (
        <div className="signout-section">
          <h1 className="signout-page-title">
            Returning or Signing Out?
          </h1>
          <button
            className="signout-menu-button signout-menu-button--orange"
            onClick={() => setStep("info")}
          >
            Sign Out Samples
          </button>

          <button
            className="signout-menu-button signout-menu-button--green"
            onClick={() => setStep("return")}
          >
            Return Samples
          </button>

          <button
            className="signout-menu-button signout-menu-button--blue"
            onClick={() => {
              setStep("outSamples");
              loadActiveSamples();
            }}
          >
            Samples Currently Out
          </button>

          <button
            className="signout-menu-button signout-menu-button--gray"
            onClick={() => setMode("mainMenu")}
          >
            Main Menu
          </button>
        </div>
        )}

        {/* INFO STEP */}
        {step === "info" && (
          <>
            <h1 className="signout-step-title">Customer Info</h1>

            <input
              placeholder="Customer Name"
              className="signout-input"
              onChange={(e) =>
                setCustomerInfo(prev => ({ ...prev, name: e.target.value }))
              }
            />

            <input
              placeholder="Customer Number"
              className="signout-input"
              onChange={(e) =>
                setCustomerInfo(prev => ({ ...prev, number: e.target.value }))
              }
            />

            <input
              placeholder="Employee Name"
              className="signout-input"
              onChange={(e) =>
                setCustomerInfo(prev => ({ ...prev, employee: e.target.value }))
              }
            />

            <button
              className="signout-proceed-button"
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
              className="signout-full-back-button"
              onClick={() => setMode("mainMenu")}
            >
              Back
            </button>
          </>
        )}

        {/* SEARCH STEP */}
        {step === "search" && (
          <>
            <h1 className="signout-step-title">Search Samples</h1>

            <button
              className="signout-camera-button"
              onClick={() => setScannerOpen(true)}
            >
              Scan Barcode
            </button>

            <input
              placeholder="Enter Barcode"
              className="signout-input"
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
              <div className="signout-not-found">
                <p className="signout-emphasis">
                  Barcode {notFoundBarcode} was not found.
                </p>

                <button
                  className="signout-small-blue-button"
                  onClick={() => setMiscOpen(true)}
                >
                  Add as Unlisted Sample
                </button>

                <button
                  className="signout-small-gray-offset"
                  onClick={() => setNotFoundBarcode("")}
                >
                  Cancel
                </button>
              </div>
            )}

            <button
              className="signout-search-button"
              onClick={() => searchBarcode(barcode)}
            >
              Search
            </button>

            <button
              className="signout-unlisted-button"
              onClick={() => {
                setNotFoundBarcode("");
                setMiscOpen(true);
              }}
            >
              Add Unlisted Sample
            </button>

            {/* RESULTS */}
            {results.map((item, i) => (
              <div key={i} className="signout-search-result">
                {item}
                <button
                  className="signout-add-result-button"
                  onClick={() => addToCart(item)}
                >
                  Add
                </button>
              </div>
            ))}

            {/* CART */}
            <h3 className="signout-cart-heading">Cart</h3>

            {cartItems.map((item, i) => (
              <div key={item.id} className="signout-cart-item">
                <div>
                  <div>{item.sample_name}</div>

                  <div className="signout-muted-small">
                    Barcode: {item.barcode}
                  </div>
                </div>
                <span
                  className="signout-remove"
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
              className="signout-confirm-out"
              onClick={signOut}
            >
              Sign Out
            </button>

            <button
              className="signout-full-back"
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
              <div className="signout-misc-overlay">
                <div className="signout-misc-dialog">

                  <h3 className="signout-dialog-heading">
                    Add Unlisted Sample
                  </h3>

                  {notFoundBarcode && (
                    <p className="signout-center">
                      Barcode: <strong>{notFoundBarcode}</strong>
                    </p>
                  )}

                  <input
                    type="text"
                    placeholder="Enter Sample Description"
                    className="signout-input"
                    value={miscDescription}
                    onChange={(e) => setMiscDescription(e.target.value)}
                    autoFocus
                  />

                  <div className="signout-inline-actions">

                    <button
                      className="signout-dialog-add"
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
                      className="signout-dialog-cancel"
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
          <div className="signout-section">

            <h1 className="signout-step-title">
              Return Samples
            </h1>


            {/* ========================= */}
            {/* CUSTOMER LOOKUP */}
            {/* ========================= */}

            <div className="signout-panel">

              <h2 className="signout-subheading">
                Find Customer
              </h2>

              <input
                placeholder="Enter Customer Name"
                className="signout-input"
                value={returnCustomerSearch}
                onChange={(e) =>
                  setReturnCustomerSearch(
                    e.target.value
                  )
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    searchReturnCustomer();
                  }
                }}
              />

              <button
                className="signout-search-button"
                onClick={searchReturnCustomer}
              >
                Search Customer
              </button>

            </div>


            {/* ========================= */}
            {/* CUSTOMER SEARCH RESULTS */}
            {/* ========================= */}

            {!selectedReturnCustomer &&
              returnCustomerResults.map(
                (customer, i) => (

                  <div
                    key={i}
                    className="signout-card"
                  >

                    <div className="signout-subheading">
                      {customer.customer_name}
                    </div>

                    <div>
                      {customer.customer_phone}
                    </div>

                    <div className="signout-customer-count">
                      {customer.items.length} sample
                      {customer.items.length === 1
                        ? ""
                        : "s"}{" "}
                      currently out
                    </div>

                    <button
                      className="signout-view-button"
                      onClick={() => {
                        setSelectedReturnCustomer(
                          customer
                        );

                        setSelectedReturnIds([]);
                      }}
                    >
                      View Samples
                    </button>

                  </div>
                )
              )}


            {/* ========================= */}
            {/* SELECTED CUSTOMER SAMPLES */}
            {/* ========================= */}

            {selectedReturnCustomer && (

              <div className="signout-panel">

                <div>

                  <div className="signout-customer-title">
                    {selectedReturnCustomer.customer_name}
                  </div>

                  <div>
                    {selectedReturnCustomer.customer_phone}
                  </div>

                </div>

                {selectedReturnCustomer.items.map(
                  item => (

                    <label
                      key={item.id}
                      className="signout-checkbox-row"
                    >

                      <input
                        type="checkbox"
                        checked={
                          selectedReturnIds.includes(
                            item.id
                          )
                        }
                        onChange={() =>
                          toggleReturnSelection(
                            item.id
                          )
                        }
                      />

                      <div>

                        <div className="signout-emphasis">
                          {item.sample_name_snapshot}
                        </div>

                        <div className="signout-muted-small">
                          Barcode:{" "}
                          {item.barcode_snapshot}
                        </div>

                        <div className="signout-muted-small">
                          Signed out:{" "}
                          {new Date(
                            item.signed_out_at
                          ).toLocaleString()}
                        </div>

                      </div>

                    </label>
                  )
                )}

                <div className="signout-inline-actions">

                  <button
                    className="signout-add-returns"
                    onClick={addSelectedReturnsToCart}
                  >
                    Add Selected to Return Cart
                  </button>

                  <button
                    className="signout-return-back"
                    onClick={() => {
                      setSelectedReturnCustomer(null);
                      setSelectedReturnIds([]);
                    }}
                  >
                    Back
                  </button>

                </div>

              </div>
            )}


            {/* ========================= */}
            {/* BARCODE LOOKUP */}
            {/* ========================= */}

            <div className="signout-divider-section">

              <h2 className="signout-subheading">
                Or Scan a Sample
              </h2>

              <p className="signout-muted-small">
                Scan the barcode or enter it manually.
              </p>

              <input
                placeholder="Scan or Enter Barcode"
                className="signout-input"
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

              <div className="signout-inline-actions">

                <button
                  className="signout-return-search"
                  onClick={() =>
                    searchReturnBarcode(returnBarcode)
                  }
                >
                  Search Barcode
                </button>

                <button
                  className="signout-return-camera"
                  onClick={() =>
                    setReturnScannerOpen(true)
                  }
                >
                  Scan With Camera
                </button>

              </div>

            </div>


            {/* ========================= */}
            {/* MULTIPLE BARCODE MATCHES */}
            {/* ========================= */}

            {scanReturnMatches.length > 1 && (

              <div className="signout-matches-warning">

                <h3 className="signout-cart-heading">
                  Multiple Copies Are Currently Out
                </h3>

                <p>
                  Select the customer returning this sample:
                </p>

                {scanReturnMatches.map(item => (

                  <div
                    key={item.id}
                    className="signout-match-card"
                  >

                    <div className="signout-emphasis">
                      {item.sample_name_snapshot}
                    </div>

                    <div className="signout-muted-small">
                      Barcode: {item.barcode_snapshot}
                    </div>

                    <div className="signout-spaced-small">
                      Customer:{" "}
                      <strong>
                        {item.customer_name}
                      </strong>
                    </div>

                    <div>
                      Phone: {item.customer_phone}
                    </div>

                    <div className="signout-muted-small">
                      Signed out:{" "}
                      {new Date(
                        item.signed_out_at
                      ).toLocaleString()}
                    </div>

                    <button
                      className="signout-add-return"
                      onClick={() => {

                        addToReturnCart(item);

                        setScanReturnMatches([]);
                      }}
                    >
                      Add This Return
                    </button>

                  </div>

                ))}

              </div>

            )}


            {/* ========================= */}
            {/* RETURN CART */}
            {/* ========================= */}

            <div className="signout-divider-section">

              <h3 className="signout-subheading">
                Return Cart ({returnItems.length})
              </h3>

              {returnItems.length === 0 && (
                <p className="signout-muted">
                  No samples have been added for return.
                </p>
              )}

              {returnItems.map((item, i) => (

                <div
                  key={item.id}
                  className="signout-return-cart-item"
                >

                  <div className="signout-cart-top">

                    <div>

                      <div className="signout-emphasis">
                        {item.sample_name_snapshot}
                      </div>

                      <div className="signout-muted-small">
                        Barcode: {item.barcode_snapshot}
                      </div>

                      <div className="signout-spaced-small">
                        Customer:{" "}
                        <strong>
                          {item.customer_name}
                        </strong>
                      </div>

                      <div>
                        Phone: {item.customer_phone}
                      </div>

                      <div className="signout-muted-small">
                        Signed out:{" "}
                        {new Date(
                          item.signed_out_at
                        ).toLocaleString()}
                      </div>

                    </div>

                    <span
                      className="signout-remove"
                      onClick={() =>
                        setReturnItems(prev =>
                          prev.filter(
                            (_, index) =>
                              index !== i
                          )
                        )
                      }
                    >
                      ✕
                    </span>

                  </div>

                </div>

              ))}

            </div>


            {/* ========================= */}
            {/* RETURN BUTTONS */}
            {/* ========================= */}

            <button
              className="signout-confirm-return"
              onClick={confirmReturns}
            >
              Confirm Returns
            </button>

            <button
              className="signout-full-back"
              onClick={() => {

                setReturnItems([]);
                setReturnBarcode("");

                setReturnCustomerSearch("");
                setReturnCustomerResults([]);

                setSelectedReturnCustomer(null);
                setSelectedReturnIds([]);

                setScanReturnMatches([]);

                setReturnScannerOpen(false);

                setStep("signOutOptions");
              }}
            >
              Back
            </button>


            {/* ========================= */}
            {/* CAMERA SCANNER */}
            {/* ========================= */}

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

                  searchReturnBarcode(
                    scannedCode
                  );
                }}
              />

            )}

          </div>
        )}

        {/* Out Samples */}
        {step === "outSamples" && (
          <div className="signout-active-section">

            <h1 className="signout-step-title">
              Samples Currently Out
            </h1>

            <input
              placeholder="Search customer, phone, sample or barcode"
              className="signout-input"
              value={activeSearch}
              onChange={(e) =>
                setActiveSearch(e.target.value)
              }
            />

            <button
              className="signout-small-blue-button"
              onClick={loadActiveSamples}
            >
              Refresh
            </button>

            {activeLoading && (
              <p>Loading...</p>
            )}

            {!activeLoading && 
              filteredActiveSamples.length === 0 && (
                <p className="signout-empty">
                  No samples currently out.
                </p>
              )}

            {filteredActiveSamples.map(item => (
              <div
                key={item.id}
                className="signout-card"
              >

                <div className="signout-subheading">
                  {item.sample_name_snapshot}
                </div>

                <div className="signout-muted-small">
                  Barcode: {item.barcode_snapshot}
                </div>

                <div className="signout-spaced">
                  Customer:{" "}
                  <strong>{item.customer_name}</strong>
                </div>

                <div>
                  Phone: {item.customer_phone}
                </div>

                <div>
                  Employee: {item.employee_name}
                </div>

                <div className="signout-muted-date">
                  Signed out:{" "}
                  {new Date(
                    item.signed_out_at
                  ).toLocaleString()}
                </div>

              </div>
            ))}

            <button
              className="signout-full-back"
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