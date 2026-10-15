/**
 * Approval chain direction picker: the same employee reporting line shown both
 * ways (top → employee and employee → top). Shared by the single and bulk
 * assign dialogs so the chain UI stays identical everywhere.
 */
function ApprovalChainPicker({ chainPreview, chainLoading, value, onChange, radioName = "approval-chain-order" }) {
  return (
    <div className="doc-chain-pick">
      <span className="stacked-label">
        <span>Approval chain *</span>
      </span>
      {chainLoading ? (
        <p className="doc-form-note">Loading reporting line…</p>
      ) : chainPreview?.chain?.length ? (
        <>
          <div className="doc-chain-options" role="radiogroup" aria-label="Approval chain direction">
            <label
              className={`doc-chain-option${value === "TOP_TO_EMP" ? " doc-chain-option--active" : ""}`}
            >
              <input
                type="radio"
                name={radioName}
                value="TOP_TO_EMP"
                checked={value === "TOP_TO_EMP"}
                onChange={() => onChange("TOP_TO_EMP")}
              />
              <span className="doc-chain-option-title">Top → employee (root first)</span>
              <ol className="doc-chain doc-chain--compact">
                {(chainPreview.reversedChain || []).map((u, i) => (
                  <li key={String(u._id)} className="doc-chain-step">
                    <div className="doc-chain-step-main">
                      <div className="doc-chain-role">
                        Step {i + 1} · {u.name}
                      </div>
                      <div className="doc-chain-name">
                        {u.empCode ? `${u.empCode}` : ""}
                        {u.empCode && u.designation ? " · " : ""}
                        {u.designation || ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </label>
            <label
              className={`doc-chain-option${value === "EMP_TO_TOP" ? " doc-chain-option--active" : ""}`}
            >
              <input
                type="radio"
                name={radioName}
                value="EMP_TO_TOP"
                checked={value === "EMP_TO_TOP"}
                onChange={() => onChange("EMP_TO_TOP")}
              />
              <span className="doc-chain-option-title">Employee → top (reporting line up)</span>
              <ol className="doc-chain doc-chain--compact">
                {(chainPreview.chain || []).map((u, i) => (
                  <li key={String(u._id)} className="doc-chain-step">
                    <div className="doc-chain-step-main">
                      <div className="doc-chain-role">
                        Step {i + 1} · {u.name}
                      </div>
                      <div className="doc-chain-name">
                        {u.empCode ? `${u.empCode}` : ""}
                        {u.empCode && u.designation ? " · " : ""}
                        {u.designation || ""}
                      </div>
                    </div>
                  </li>
                ))}
              </ol>
            </label>
          </div>
          <p className="doc-form-note">
            The picked direction becomes this form&apos;s approval chain — the doctor&apos;s submission
            moves through it step by step.
          </p>
        </>
      ) : (
        <p className="doc-form-note">
          No reporting line found for this employee — the form will complete on its own once
          the doctor submits it.
        </p>
      )}
    </div>
  );
}

export default ApprovalChainPicker;
