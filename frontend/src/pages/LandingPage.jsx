import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import "./landing.css";

/* ---- Animated Counter ---- */
function AnimatedCounter({ target, suffix = "", duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.3 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!visible) return;
    let start = 0;
    const increment = target / (duration / 16);
    const timer = setInterval(() => {
      start += increment;
      if (start >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.floor(start));
      }
    }, 16);
    return () => clearInterval(timer);
  }, [visible, target, duration]);

  return (
    <span ref={ref}>
      {count.toLocaleString()}
      {suffix}
    </span>
  );
}

/* ---- Scroll Reveal Wrapper ---- */
function Reveal({ children, delay = 0 }) {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`animate-on-scroll ${visible ? "visible" : ""}`}
      style={{ transitionDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

/* ---- Particles ---- */
// Generated once at module scope: the values are decorative, so recomputing
// them on each render would be both impure and wasted work.
const PARTICLES = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  left: Math.random() * 100,
  delay: Math.random() * 15,
  duration: 12 + Math.random() * 10,
  size: 2 + Math.random() * 3,
}));

function Particles() {
  return (
    <div className="particles-container">
      {PARTICLES.map((p) => (
        <div
          key={p.id}
          className="particle"
          style={{
            left: `${p.left}%`,
            width: `${p.size}px`,
            height: `${p.size}px`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ---- Floating 3D Shapes ---- */
function FloatingShapes() {
  return (
    <div className="floating-shapes">
      <div className="shape-3d shape-1">
        <div className="cube">
          <div className="face front" />
          <div className="face back" />
          <div className="face right" />
          <div className="face left" />
          <div className="face top" />
          <div className="face bottom" />
        </div>
      </div>
      <div className="shape-3d shape-2">
        <div className="sphere" />
      </div>
      <div className="shape-3d shape-3">
        <div className="cube">
          <div className="face front" />
          <div className="face back" />
          <div className="face right" />
          <div className="face left" />
          <div className="face top" />
          <div className="face bottom" />
        </div>
      </div>
      <div className="shape-3d shape-4">
        <div className="sphere" />
      </div>
    </div>
  );
}

/* ---- Features Data ---- */
const features = [
  {
    icon: "⚡",
    title: "Workflow Automation",
    description:
      "Build automated approval workflows for finance, HR, IT, operations, and any business process. Route requests to the right approvers automatically.",
    tag: "No-Code Builder",
    highlight: "AI-Powered",
  },
  {
    icon: "📝",
    title: "Smart Form Builder",
    description:
      "Create dynamic forms with conditional logic, validations, and custom fields. Dispatch forms to employees and track submissions in real-time.",
    tag: "Dynamic Forms",
    highlight: "Real-time",
  },
  {
    icon: "🔐",
    title: "KYC Verification",
    description:
      "End-to-end Know Your Customer verification with document upload, verification workflows, and compliance tracking.",
    tag: "Compliance",
    highlight: "Secure",
  },
  {
    icon: "🌳",
    title: "Organization Tree",
    description:
      "Visual org chart management with multi-level hierarchy, employee mapping, and reporting chain visualization.",
    tag: "Multi-Level",
    highlight: "Visual",
  },
  {
    icon: "✅",
    title: "Multi-Step Approvals",
    description:
      "Create approval chains with multiple levels, conditional routing, SLA tracking, and escalation rules.",
    tag: "Approval Chains",
    highlight: "Flexible",
  },
  {
    icon: "✍️",
    title: "Digital Signatures",
    description:
      "Built-in e-signature pad for documents and forms. Legally binding signatures with audit trail.",
    tag: "E-Sign",
    highlight: "Legally Valid",
  },
  {
    icon: "🏢",
    title: "Multi-Tenant SaaS",
    description:
      "Platform for multiple organizations with isolated data, custom branding, and tenant-level admin controls.",
    tag: "SaaS Ready",
    highlight: "Isolated",
  },
  {
    icon: "📊",
    title: "Audit Trail",
    description:
      "Complete audit logging for every action, decision, and change. Tamper-proof records for compliance.",
    tag: "Compliance",
    highlight: "Tamper-Proof",
  },
  {
    icon: "🔔",
    title: "Smart Notifications",
    description:
      "Real-time notifications for approvals, assignments, and deadlines. Email and in-app alerts.",
    tag: "Real-Time",
    highlight: "Multi-Channel",
  },
];

/* ---- Steps Data ---- */
const steps = [
  {
    number: "01",
    title: "Create Your Org",
    description: "Set up your organization tree, invite employees, and assign roles.",
  },
  {
    number: "02",
    title: "Build Workflows",
    description: "Design approval chains and forms with our no-code builder.",
  },
  {
    number: "03",
    title: "Dispatch & Track",
    description: "Send forms to teams, track submissions, and manage approvals.",
  },
  {
    number: "04",
    title: "Audit & Report",
    description: "Full audit trail, analytics, and exportable compliance reports.",
  },
];

/* ---- Main Landing Page ---- */
function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  return (
    <div className="landing-page">
      {/* Background */}
      <div className="landing-bg">
        <div className="gradient-orb orb-1" />
        <div className="gradient-orb orb-2" />
        <div className="gradient-orb orb-3" />
        <div className="grid-pattern" />
      </div>
      <FloatingShapes />
      <Particles />

      {/* Navigation */}
      <nav className={`landing-nav ${scrolled ? "scrolled" : ""}`}>
        <Link to="/" className="nav-logo">
          <div className="logo-icon">P</div>
          Pinktech
        </Link>
        <ul className={`nav-links ${mobileMenu ? "active" : ""}`}>
          <li>
            <a href="#features" onClick={() => setMobileMenu(false)}>
              Features
            </a>
          </li>
          <li>
            <a href="#how-it-works" onClick={() => setMobileMenu(false)}>
              How It Works
            </a>
          </li>
          <li>
            <a href="#stats" onClick={() => setMobileMenu(false)}>
              Why Pinktech
            </a>
          </li>
          <li>
            <a href="#cta" onClick={() => setMobileMenu(false)}>
              Contact
            </a>
          </li>
        </ul>
        <div className="nav-cta">
          <Link to="/login" className="btn-ghost">
            Sign In
          </Link>
          <Link to="/login" className="btn-primary-landing">
            Get Started
          </Link>
          <button
            className="mobile-menu-btn"
            onClick={() => setMobileMenu(!mobileMenu)}
            aria-label="Toggle menu"
          >
            {mobileMenu ? "✕" : "☰"}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="hero-section">
        <div className="hero-badge">
          <span className="pulse-dot" />
          Built by Pinktech — Enterprise Workflow Platform
        </div>

        <h1 className="hero-title">
          Automate Approvals.
          <br />
          <span className="gradient-text">Empower Decisions.</span>
        </h1>

        <p className="hero-subtitle">
          The complete multi-tenant platform for workflow automation, form dispatch,
          KYC verification, and multi-step approvals. Built for modern teams that
          move fast.
        </p>

        <div className="hero-cta-group">
          <Link to="/login" className="btn-hero-primary">
            Start Free →
          </Link>
          <a href="#features" className="btn-hero-secondary">
            Explore Features
          </a>
        </div>

        {/* 3D Dashboard Preview */}
        <div className="hero-visual">
          <div className="hero-dashboard">
            <div className="dashboard-header">
              <div className="dashboard-dot red" />
              <div className="dashboard-dot yellow" />
              <div className="dashboard-dot green" />
            </div>
            <div className="dashboard-body">
              <div className="dashboard-sidebar">
                <div className="sidebar-item active">
                  <span className="icon">📊</span> Dashboard
                </div>
                <div className="sidebar-item">
                  <span className="icon">🏢</span> Tenants
                </div>
                <div className="sidebar-item">
                  <span className="icon">👥</span> Employees
                </div>
                <div className="sidebar-item">
                  <span className="icon">📝</span> Forms
                </div>
                <div className="sidebar-item">
                  <span className="icon">✅</span> Approvals
                </div>
                <div className="sidebar-item">
                  <span className="icon">🔐</span> KYC
                </div>
              </div>
              <div className="dashboard-main">
                <div className="dashboard-stats">
                  <div className="stat-card">
                    <div className="stat-value">2.4K</div>
                    <div className="stat-label">Pending Approvals</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">98%</div>
                    <div className="stat-label">SLA Compliance</div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-value">156</div>
                    <div className="stat-label">Active Tenants</div>
                  </div>
                </div>
                <div className="dashboard-chart">
                  <div className="chart-bar" />
                  <div className="chart-bar" />
                  <div className="chart-bar" />
                  <div className="chart-bar" />
                  <div className="chart-bar" />
                  <div className="chart-bar" />
                  <div className="chart-bar" />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Scroll Indicator */}
        <div className="scroll-indicator">
          <div className="mouse" />
        </div>
      </section>

      {/* Trusted By */}
      <section className="trusted-section">
        <p className="trusted-label">Trusted by forward-thinking organizations</p>
        <div className="trusted-logos">
          <span className="trusted-logo">Acme Corp</span>
          <span className="trusted-logo">TechFlow</span>
          <span className="trusted-logo">DataSync</span>
          <span className="trusted-logo">CloudBase</span>
          <span className="trusted-logo">InnovateX</span>
        </div>
      </section>

      {/* Features Section */}
      <section className="features-section" id="features">
        <Reveal>
          <div className="section-header">
            <div className="section-badge">✨ Features</div>
            <h2 className="section-title">Everything You Need to Automate</h2>
            <p className="section-subtitle">
              A complete toolkit for workflow automation, from form creation to
              final approval — all in one platform.
            </p>
          </div>
        </Reveal>

        <div className="features-grid">
          {features.map((feature, index) => (
            <Reveal key={index} delay={index * 100}>
              <div className="feature-card-3d">
                <div className="glow-line" />
                <div className="feature-icon-3d">{feature.icon}</div>
                <h3>{feature.title}</h3>
                <p>{feature.description}</p>
                <span className="feature-tag">{feature.tag}</span>
                <span className="feature-highlight">
                  <span className="check">✓</span> {feature.highlight}
                </span>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="how-section" id="how-it-works">
        <Reveal>
          <div className="section-header">
            <div className="section-badge">🚀 How It Works</div>
            <h2 className="section-title">Up and Running in Minutes</h2>
            <p className="section-subtitle">
              No lengthy implementation. Launch your workflows in minutes with
              our intuitive platform.
            </p>
          </div>
        </Reveal>

        <div className="steps-container">
          {steps.map((step, index) => (
            <Reveal key={index} delay={index * 150}>
              <div className="step-item">
                <div className="step-number">{step.number}</div>
                <h3>{step.title}</h3>
                <p>{step.description}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Stats Section */}
      <section className="stats-section" id="stats">
        <Reveal>
          <div className="section-header">
            <div className="section-badge">📈 By the Numbers</div>
            <h2 className="section-title">Why Teams Choose Pinktech</h2>
          </div>
        </Reveal>

        <div className="stats-grid">
          <Reveal delay={0}>
            <div className="stat-item">
              <div className="stat-number">
                <AnimatedCounter target={10000} suffix="+" />
              </div>
              <div className="stat-desc">Workflows Automated</div>
            </div>
          </Reveal>
          <Reveal delay={100}>
            <div className="stat-item">
              <div className="stat-number">
                <AnimatedCounter target={500} suffix="+" />
              </div>
              <div className="stat-desc">Organizations</div>
            </div>
          </Reveal>
          <Reveal delay={200}>
            <div className="stat-item">
              <div className="stat-number">
                <AnimatedCounter target={99} suffix="%" />
              </div>
              <div className="stat-desc">Uptime SLA</div>
            </div>
          </Reveal>
          <Reveal delay={300}>
            <div className="stat-item">
              <div className="stat-number">
                <AnimatedCounter target={50} suffix="K+" />
              </div>
              <div className="stat-desc">Happy Users</div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* CTA Section */}
      <section className="cta-section" id="cta">
        <Reveal>
          <div className="cta-box">
            <h2>
              Ready to Transform Your{" "}
              <span className="gradient-text">Workflow?</span>
            </h2>
            <p>
              Join hundreds of organizations automating approvals with Pinktech.
              Get started free today.
            </p>
            <div className="hero-cta-group">
              <Link to="/login" className="btn-hero-primary">
                Get Started Free →
              </Link>
              <a href="#features" className="btn-hero-secondary">
                Learn More
              </a>
            </div>
          </div>
        </Reveal>
      </section>

      {/* Footer */}
      <footer className="landing-footer">
        <p className="footer-text">
          © {new Date().getFullYear()}{" "}
          <span style={{ color: "#a5b4fc", fontWeight: 600 }}>Pinktech</span> by{" "}
          <span style={{ color: "#94a3b8" }}>Apixey Startup</span>. All rights
          reserved. |{" "}
          <Link to="/login">Sign In</Link>
        </p>
      </footer>
    </div>
  );
}

export default LandingPage;
