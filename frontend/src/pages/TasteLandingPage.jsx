import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

const STORY_STAGES = [
  {
    label: "Collect",
    title: "A clean start for every profile.",
    fields: ["Profile details", "Practice information", "Required documents"],
    action: "Save and continue",
  },
  {
    label: "Review",
    title: "Keep every detail in view.",
    fields: ["Identity and credentials", "Document checklist", "Review notes"],
    action: "Send for review",
  },
  {
    label: "Prepare",
    title: "Turn approved details into an agreement.",
    fields: ["Agreement template", "Assigned signers", "Signing order"],
    action: "Prepare agreement",
  },
  {
    label: "Sign",
    title: "Bring the workflow to a clear close.",
    fields: ["Signature requests", "Signing status", "Completed agreement"],
    action: "Review signatures",
  },
];

const FEATURES = [
  {
    label: "Profiles",
    title: "Start with the right details.",
    description:
      "Collect profile, practice, and credential information in one structured place.",
    checklist: ["Profile information", "Practice details", "Supporting documents"],
    action: "Review profile",
  },
  {
    label: "Documents",
    title: "Keep documents connected to the work.",
    description:
      "Organize required documents alongside the records and review steps they support.",
    checklist: ["Required documents", "Review status", "Team notes"],
    action: "Open documents",
  },
  {
    label: "Agreements",
    title: "Prepare agreements from reusable templates.",
    description:
      "Move from approved details to a prepared agreement without losing the context.",
    checklist: ["Template details", "Signer assignments", "Signing order"],
    action: "Prepare agreement",
  },
  {
    label: "Signatures",
    title: "See what still needs a signature.",
    description:
      "Follow signing requests through completion with the agreement in the same workspace.",
    checklist: ["Signature request", "Signer progress", "Completed agreement"],
    action: "View agreement",
  },
];

function ProductFragment({ stage, compact = false, label }) {
  return (
    <article className={`taste-fragment${compact ? " taste-fragment--compact" : ""}`} data-ui>
      <div className="taste-fragment-top">
        <span className="taste-fragment-mark" aria-hidden="true">P</span>
        <span>{label || "Pinktech workspace"}</span>
        <span className="taste-fragment-status">
          <span aria-hidden="true" />
          Workflow preview
        </span>
      </div>
      <div className="taste-fragment-body">
        <div className="taste-fragment-step">
          <span>{stage.label}</span>
          <span>Step {STORY_STAGES.indexOf(stage) + 1} of 4</span>
        </div>
        <h3>{stage.title}</h3>
        <div className="taste-fragment-fields">
          {stage.fields.map((field, index) => (
            <div className="taste-fragment-field" key={field}>
              <span className={`taste-fragment-check${index === 0 ? " is-checked" : ""}`} aria-hidden="true" />
              <span>{field}</span>
              <span className="taste-fragment-field-arrow" aria-hidden="true">↗</span>
            </div>
          ))}
        </div>
        <div className="taste-fragment-footer">
          <span>Workflow overview</span>
          <button type="button" disabled tabIndex={-1}>{stage.action}</button>
        </div>
      </div>
    </article>
  );
}

function FeatureFragment({ feature }) {
  return (
    <article className="taste-feature-fragment" data-ui>
      <div className="taste-feature-fragment-head">
        <span className="taste-feature-fragment-icon" aria-hidden="true">
          {feature.label.slice(0, 1)}
        </span>
        <div>
          <span className="taste-fragment-step">Workspace / {feature.label}</span>
          <h3>{feature.title}</h3>
        </div>
        <span className="taste-feature-dots" aria-hidden="true">•••</span>
      </div>
      <div className="taste-feature-fragment-content">
        <div className="taste-feature-fragment-sidebar">
          <span className="taste-sidebar-active">{feature.label}</span>
          <span>Overview</span>
          <span>Activity</span>
        </div>
        <div className="taste-feature-fragment-checklist">
          <span className="taste-fragment-step">NEXT IN THIS WORKFLOW</span>
          {feature.checklist.map((item, index) => (
            <div key={item} className="taste-feature-row">
              <span className={`taste-feature-checkbox${index === 0 ? " is-checked" : ""}`} />
              <span>{item}</span>
            </div>
          ))}
          <button type="button" disabled tabIndex={-1}>{feature.action}</button>
        </div>
      </div>
    </article>
  );
}

function TasteLandingPage() {
  const storyRef = useRef(null);
  const [stageIndex, setStageIndex] = useState(0);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    document.title = "Pinktech | A clearer path from intake to signature";

    let frame = 0;
    const updateStage = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!storyRef.current) return;
        if (window.innerWidth <= 900) {
          setStageIndex(0);
          return;
        }
        const scrollable = Math.max(1, storyRef.current.offsetHeight - window.innerHeight);
        const progress = Math.min(
          0.999,
          Math.max(0, -storyRef.current.getBoundingClientRect().top / scrollable),
        );
        setStageIndex(Math.min(STORY_STAGES.length - 1, Math.floor(progress * STORY_STAGES.length)));
      });
    };

    updateStage();
    window.addEventListener("scroll", updateStage, { passive: true });
    window.addEventListener("resize", updateStage);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", updateStage);
      window.removeEventListener("resize", updateStage);
    };
  }, []);

  const closeMenu = () => setMenuOpen(false);
  const feature = FEATURES[featureIndex];

  return (
    <div className="taste-site">
      <header className="taste-nav">
        <Link className="taste-brand" to="/" aria-label="Pinktech home" onClick={closeMenu}>
          <span className="taste-brand-mark" aria-hidden="true">P</span>
          <span>Pinktech</span>
        </Link>
        <button
          className="taste-menu-toggle"
          type="button"
          aria-label={menuOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <span />
          <span />
        </button>
        <nav className={`taste-nav-links${menuOpen ? " is-open" : ""}`} aria-label="Main navigation">
          <a href="#workflow" onClick={closeMenu}>Workflow</a>
          <a href="#capabilities" onClick={closeMenu}>Capabilities</a>
          <Link className="taste-nav-login" to="/login" onClick={closeMenu}>Sign in <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>

      <main>
        <section className="taste-story" ref={storyRef} aria-label="Pinktech workflow">
          <div className="taste-story-stage">
            <h1 className="taste-visually-hidden">From the first detail to the final signature.</h1>
            <div className="taste-story-title" aria-hidden="true">
              <p className="taste-story-phrase"><span>From the</span><span>first detail</span></p>
              <div className="taste-story-preview">
                {STORY_STAGES.map((storyStage, index) => (
                  <div className={`taste-story-card${index === stageIndex ? " is-current" : ""}`} key={storyStage.label}>
                    {index === stageIndex && <ProductFragment stage={storyStage} compact />}
                  </div>
                ))}
              </div>
              <p className="taste-story-phrase taste-story-phrase--right"><span>to the final</span><span>signature.</span></p>
            </div>
            <div className="taste-story-bottom">
              <p>
                Collect details, review documents, prepare agreements, and keep signatures moving
                in one considered workflow.
              </p>
              <Link className="taste-button taste-button--primary" to="/login">
                Enter your workspace <span aria-hidden="true">↗</span>
              </Link>
            </div>
            <div className="taste-story-progress" role="group" aria-label={`Workflow step ${stageIndex + 1} of ${STORY_STAGES.length}`}>
              {STORY_STAGES.map((item, index) => (
                <span key={item.label} className={index <= stageIndex ? "is-active" : ""}>
                  <span>{index + 1}</span>
                  {item.label}
                </span>
              ))}
            </div>
          </div>
        </section>

        <section className="taste-capabilities taste-section" id="capabilities">
          <div className="taste-section-heading">
            <h2>Keep the work<br />together.</h2>
            <div className="taste-section-aside">
              <span className="taste-meta-note">A connected workspace</span>
              <p>Each step has a place, and the important details stay close to the agreement.</p>
            </div>
          </div>
          <div className="taste-capability-layout">
            <div className="taste-capability-list" role="group" aria-label="Pinktech capabilities">
              {FEATURES.map((item, index) => (
                <button
                  className={`taste-capability-tab${featureIndex === index ? " is-active" : ""}`}
                  key={item.label}
                  id={`capability-tab-${index}`}
                  type="button"
                  aria-pressed={featureIndex === index}
                  onClick={() => setFeatureIndex(index)}
                >
                  <span className="taste-capability-index">{index + 1}</span>
                  <span className="taste-capability-copy">
                    <span>{item.label}</span>
                    {featureIndex === index && <span>{item.description}</span>}
                  </span>
                  <span className="taste-capability-arrow" aria-hidden="true">↗</span>
                </button>
              ))}
            </div>
            <div
              className="taste-capability-preview"
              role="region"
              id="capability-panel"
              aria-label={`${feature.label} workflow preview`}
              aria-live="polite"
            >
              <FeatureFragment feature={feature} />
            </div>
          </div>
        </section>

        <section className="taste-workflow taste-section" id="workflow">
          <div className="taste-workflow-copy">
              <h2>Keep work<br />moving.</h2>
            <p>
              Replace scattered steps with a workflow your team can follow, from the first profile
              detail to the signed agreement.
            </p>
            <span className="taste-meta-note">A clear next step</span>
            <Link className="taste-text-link" to="/login">Open your workspace <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="taste-workflow-preview">
            <ProductFragment stage={STORY_STAGES[3]} label="Agreement / Signing" />
            <div className="taste-workflow-note">
              <span aria-hidden="true">↳</span>
              Every step stays in context.
            </div>
          </div>
        </section>

        <section className="taste-close">
          <div className="taste-close-mark" aria-hidden="true">P</div>
          <h2>Make the next step<br />the obvious one.</h2>
          <span className="taste-meta-note">Agreements and signatures, in context.</span>
          <Link className="taste-button taste-button--light" to="/login">
            Sign in to Pinktech <span aria-hidden="true">↗</span>
          </Link>
        </section>
      </main>

      <footer className="taste-footer">
        <Link className="taste-brand" to="/">
          <span className="taste-brand-mark" aria-hidden="true">P</span>
          <span>Pinktech</span>
        </Link>
        <span>Agreements, kept in motion.</span>
        <span>© {new Date().getFullYear()} Pinktech</span>
      </footer>
    </div>
  );
}

export default TasteLandingPage;
