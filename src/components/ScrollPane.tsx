import React, { Component } from "react";

type PaneState = {
  height: number;
};

type Props = {
  children: React.ReactNode;
  className?: string;
  offsetHeight: number;
};

export default class ScrollPane extends Component<Props, PaneState> {
  constructor(props: Props) {
    super(props);

    this.state = { height: 0 };
  }

  componentDidMount() {
    this.updateDimensions();
    window.addEventListener("resize", this.updateDimensions);
  }

  componentWillUnmount() {
    window.removeEventListener("resize", this.updateDimensions);
  }

  /**
   * Calculate & Update state of height, needed for the scrolling
   */
  updateDimensions = () => {
    // eslint-disable-next-line react/destructuring-assignment
    const updateHeight = window.innerHeight - this.props.offsetHeight;
    this.setState({ height: updateHeight });
  };

  render() {
    const { children, className } = this.props;
    const { height } = this.state;

    return (
      <div className={className} style={{ overflowY: "auto", overflowX: "hidden", height }}>
        {children}
      </div>
    );
  }
}
