# Architecture Diagramming

## Scope

Clear, consistent, and maintainable visual documentation of system architecture, data flows, deployment topologies, and decision records.

## Non-negotiables

- Diagrams-as-code is the default. Use Mermaid, PlantUML, Structurizr, or D2. Never commit binary image files (PNG, JPG) as canonical diagrams; they drift and cannot be diffed.
- Every diagram has a title, legend, and version/date. Stale diagrams are worse than no diagrams. Review diagrams in PRs just like code.
- Use standard notation consistently: C4 Model for system architecture, UML for class/sequence diagrams, BPMN for workflows, ERD for data models. Mixing notations in the same diagram is forbidden.
- Abstraction levels are explicit: L1 (System Context), L2 (Container), L3 (Component), L4 (Code). Never mix levels. A single diagram shows one level of detail.
- Arrows indicate direction of dependency or data flow, not just connection. Label arrows with protocol, synchronous/async, and payload type where meaningful.
- External systems (SaaS, third-party APIs, managed services) are distinguished from owned systems with explicit boundaries and ownership labels.
- Color has semantic meaning: green for healthy/available, red for critical/failure, blue for external, gray for deprecated. Document the color scheme in the legend.
- Deployment diagrams show: regions, AZs, network segments, ingress/egress points, and data residency boundaries. Include failover and DR paths.

## Review checks

- Diagram renders correctly in CI (Mermaid CLI, PlantUML server) and documentation site.
- All boxes and arrows are labeled; no orphan nodes.
- Diagram is up-to-date with the current code (traced from actual service names, endpoints, and data stores).
- Decision Records (ADRs) reference diagrams and vice versa.
- Check omitted: automated visual validation requires manual review.
