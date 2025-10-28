# CrowdLore: Collaborative Storytelling Game

**CrowdLore** is an innovative collaborative storytelling game built for Reddit's Devvit platform that transforms entire communities into co-authors of an epic, evolving narrative. Through a polished React interface with real-time voting, visual world tracking, immersive ASCII art storytelling, user profiles with achievements, and competitive leaderboards, players collectively shape a persistent fictional world where every decision creates permanent consequences and new chapters in their community's unique mythology.

> **Current Status**: Fully implemented and production-ready React client with comprehensive test suite, sophisticated interactive components, advanced ASCII art visualization system, competitive leaderboards, and polished user experience ready for Reddit deployment.

## 🎮 What is CrowdLore?

CrowdLore is a **democratic storytelling experience** where Reddit communities collectively make decisions that shape a persistent fictional world. Each day, players face compelling dilemmas with three carefully balanced choices, and the community's votes determine the outcome. Every decision permanently alters the world's attributes and adds new entries to the community's growing mythology.

### Key Features

🌍 **Living World System**: Four core attributes (Stability, Curiosity, Survival, Reputation) evolve based on collective choices, building a unique civilization personality over time.

🗳️ **Sophisticated Voting Interface**: Polished three-option voting system with detailed attribute effects, pros/cons analysis, and real-time visual feedback.

📚 **Immersive ASCII Art Storytelling**: Rich narrative scenarios enhanced by custom ASCII art visualizations that adapt to mobile, tablet, and desktop screens.

👤 **Comprehensive Player Progression**: Personal statistics tracking, achievement unlocking across multiple categories, and competitive leaderboards with rankings in six different categories.

🏆 **Multi-Category Competition**: Six leaderboard categories (Total Votes, Win Rate, Current Streak, Best Streak, Achievements, World Impact) with timeframe filtering.

## � QuCick Start

### Prerequisites

- **Node.js 22.2.0 or higher** (required for Devvit)
- **npm** or **yarn** package manager

### Installation & Development

1. **Clone and Install**:
   ```bash
   git clone [repository-url]
   cd crowdlore
   npm install
   ```

2. **Start Development Server**:
   ```bash
   npm run dev
   ```
   
   This runs three processes concurrently:
   - Client build with hot reloading
   - Server build with hot reloading  
   - Devvit playtest environment

3. **Access the Game**:
   - Devvit automatically creates a test subreddit (e.g., `r/crowdlore_dev`)
   - Open the provided playtest URL in your browser
   - Click "Launch App" to test the full game experience

### Alternative Testing Methods

**Client-only testing** (limited functionality):
```bash
cd src/client
npm run dev:vite
# Opens at http://localhost:7474
```

**Run comprehensive test suite**:
```bash
npm run test        # Run all tests
npm run test:unit   # Unit tests only
npm run test:integration  # Integration tests only
npm run test:performance  # Performance tests only
npm run test:coverage     # With coverage report
```

**Code quality checks**:
```bash
npm run check       # Full check (type-check + lint + format)
npm run type-check  # TypeScript compilation
npm run lint:fix    # ESLint with auto-fix
npm run prettier    # Code formatting
```

## 🏗️ Technology Stack

- **[Devvit](https://developers.reddit.com/)**: Reddit's developer platform for community experiences
- **[React 18](https://react.dev/)**: Modern UI framework with hooks and concurrent features
- **[TypeScript](https://www.typescriptlang.org/)**: Type-safe development with strict checking
- **[Tailwind CSS](https://tailwindcss.com/)**: Utility-first styling for responsive design
- **[Express](https://expressjs.com/)**: Backend API for game logic and data persistence
- **[Vite](https://vite.dev/)**: Fast build tool with optimized bundling
- **[Vitest](https://vitest.dev/)**: Modern testing framework with comprehensive coverage

### Advanced Features

- **Request Batching System**: Optimized API performance with intelligent request batching
- **Comprehensive Error Boundaries**: Graceful error handling with automatic recovery
- **Performance Monitoring**: Real-time performance tracking with optimization suggestions
- **Responsive ASCII Art**: Advanced ASCII rendering that adapts to all screen sizes
- **Mobile-First Design**: Optimized for both mobile and desktop Reddit users

## 🧪 Testing & Quality Assurance

### Comprehensive Test Suite

The project includes a robust testing framework with **37 tests** across multiple categories:

#### Unit Tests (26 tests)
- **Core Logic**: World attribute validation, vote processing, user statistics
- **Dilemma Generation**: Content moderation, option balancing, theme diversity
- **Vote Processing**: Vote tallying, tie handling, user statistics updates
- **World State Management**: Attribute updates, bounds enforcement, lore management

#### Integration Tests (5 tests)
- **Complete Voting Workflows**: End-to-end voting cycles with outcome processing
- **API Integration**: Complete user workflows with error handling
- **Data Consistency**: Multi-operation data integrity validation

#### Performance Tests (6 tests)
- **Concurrent Voting**: 100+ concurrent votes with performance limits
- **Memory Usage**: Performance under memory pressure
- **Scalability**: Load testing with increasing user counts
- **Response Times**: Consistent performance under various conditions

### Test Commands

```bash
# Run all tests
npm run test

# Run specific test categories
npm run test:unit
npm run test:integration  
npm run test:performance

# Run with coverage report
npm run test:coverage

# Watch mode for development
npm run test:watch
```

### Quality Standards

- **100% TypeScript Coverage**: Strict type checking with no `any` types
- **ESLint Compliance**: Zero errors and warnings with React hooks rules
- **Prettier Formatting**: Consistent code style across all files
- **Performance Benchmarks**: All operations complete within defined time limits
- **Error Handling**: Comprehensive error boundaries with graceful degradation

## 📁 Project Structure

```
crowdlore/
├── src/
│   ├── client/           # React frontend application
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom React hooks
│   │   └── utils/        # Client utilities
│   ├── server/           # Express backend API
│   │   ├── core/         # Game logic and services
│   │   ├── middleware/   # Express middleware
│   │   └── utils/        # Server utilities
│   └── shared/           # Shared types and utilities
│       ├── types/        # TypeScript type definitions
│       └── validation/   # Shared validation schemas
├── tests/                # Test suite
│   ├── unit/            # Unit tests
│   ├── integration/     # Integration tests
│   ├── performance/     # Performance tests
│   └── setup.ts         # Test configuration
├── tools/               # Build and development tools
└── docs/                # Documentation
```

## 🎯 Game Features

### Core Gameplay
- **Daily Dilemmas**: New scenarios every 24 hours with compelling narratives
- **Three-Choice System**: Balanced options with clear trade-offs and consequences
- **Attribute System**: Four world attributes tracking civilization development
- **Permanent Consequences**: All decisions create lasting changes to world state

### Player Experience
- **Interactive Voting Cards**: Sophisticated UI with hover effects and loading states
- **Real-Time Feedback**: Immediate visual confirmation of votes and outcomes
- **ASCII Art Visualization**: Responsive ASCII scenes that bring stories to life
- **Countdown Timers**: Create natural urgency while allowing global participation

### Progression & Competition
- **User Profiles**: Comprehensive statistics tracking with achievement systems
- **Leaderboards**: Six competitive categories with timeframe filtering
- **Achievement System**: Multi-category unlocks for various accomplishments
- **Streak Tracking**: Consecutive voting success with visual indicators

### Technical Excellence
- **Mobile-First Design**: Optimized for all screen sizes and devices
- **Performance Optimized**: Request batching and intelligent caching
- **Error Resilient**: Comprehensive error handling with retry mechanisms
- **Accessibility Compliant**: ARIA labels and semantic HTML throughout

## 🚢 Deployment

### Build for Production
```bash
npm run build
```

### Deploy to Reddit
```bash
npm run deploy
```

### Publish for Review
```bash
npm run launch
```
*Required for subreddits with 200+ members*

### Environment Setup

The project uses `npx` for Devvit commands, eliminating the need for global installations:
- `npx devvit login` - Authenticate with Reddit
- `npx devvit playtest` - Start local testing environment
- `npx devvit upload` - Deploy to Reddit
- `npx devvit publish` - Submit for review

## 🤝 Contributing

### Development Workflow

1. **Fork and Clone**: Create your own fork of the repository
2. **Install Dependencies**: Run `npm install` to set up the project
3. **Create Feature Branch**: `git checkout -b feature/your-feature-name`
4. **Develop with Tests**: Write tests for new functionality
5. **Quality Checks**: Run `npm run check` to ensure code quality
6. **Test Thoroughly**: Run `npm run test` to verify all tests pass
7. **Submit Pull Request**: Include description of changes and test results

### Code Standards

- **TypeScript**: All code must be properly typed with no `any` usage
- **React Best Practices**: Use hooks, avoid class components, follow React guidelines
- **Testing**: New features require corresponding test coverage
- **Performance**: Consider mobile users and optimize for performance
- **Accessibility**: Ensure all UI elements are accessible

### Testing Guidelines

- **Unit Tests**: Test individual functions and components in isolation
- **Integration Tests**: Test complete user workflows and API interactions
- **Performance Tests**: Verify performance under various load conditions
- **Error Handling**: Test error scenarios and recovery mechanisms

## 📄 License

This project is licensed under the BSD-3-Clause License - see the LICENSE file for details.

## 🙏 Acknowledgments

- **Reddit Devvit Team**: For providing the platform and development tools
- **React Community**: For the excellent framework and ecosystem
- **TypeScript Team**: For type safety and developer experience
- **Tailwind CSS**: For the utility-first CSS framework
- **Vitest Team**: For the modern testing framework

---

**Ready to shape stories together?** Install CrowdLore in your subreddit and watch your community create its own unique mythology through collective storytelling! 🌟
"# crowdlore-storytelling-game" 
